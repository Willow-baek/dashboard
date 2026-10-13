(function () {
  'use strict';
  var S = window.Schedule;
  var config = window.DashboardConfig;
  var SHEET_ID = config.sheetId;
  var BASE = 'https://opensheet.elk.sh/' + SHEET_ID + '/';
  var CACHE = 'home-dashboard-v2';
  var state = { settings: {}, schedules: [], exceptions: [], events: [], loaded: false, savedAt: 0,
    calendarMode: 0, calendarDate: S.seoulKey(new Date()), weather: null, weatherAt: 0, weatherOK: false, weatherStatus: 'loading',
    busy: false, sound: true, soundBlocked: false, audio: null, speech: [], lastAlertText: '', focus: null, warned: false, sheetOK: false, failureReason: '연결 확인' };
  var notified = {};
  function $(id) { return document.getElementById(id); }
  function icons() { if (window.lucide) window.lucide.createIcons(); }
  function el(tag, className, content) { var node = document.createElement(tag); if (className) node.className = className; if (content != null) node.textContent = content; return node; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function store(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }
  function read(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
  function now() { return new Date(); }
  function today() { return S.seoulKey(now()); }
  function shortDate(key) { return +key.slice(5,7) + '/' + +key.slice(8,10); }
  function fetchJSON(url) {
    return new Promise(function (resolve, reject) {
      var controller = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () { if (controller) controller.abort(); reject(new Error('timeout')); }, 12000);
      fetch(url, controller ? { signal: controller.signal } : {}).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (data) { clearTimeout(timer); resolve(data); }, function (error) { clearTimeout(timer); reject(error); });
    });
  }
  function updateSync(failed) {
    failed = failed || !state.sheetOK;
    var age = state.savedAt ? Math.max(0, Math.floor((Date.now() - state.savedAt) / 60000)) : 0;
    var warning = failed || age >= 2 || state.warned;
    $('sync-status').className = 'sr-only' + (warning ? ' warning' : '');
    if (!state.loaded) $('sync-status').textContent = failed ? state.failureReason + ' 필요 · 새로고침' : '일정 불러오는 중';
    else {
      var stamp = new Date(state.savedAt + 9 * 3600000);
      $('sync-status').textContent = (failed || age >= 2 ? state.failureReason + ' · ' : state.warned ? '예약·입력 확인 · ' : '') + '마지막 갱신 ' + String(stamp.getUTCHours()).padStart(2,'0') + ':' + String(stamp.getUTCMinutes()).padStart(2,'0') + (age >= 60 ? ' (' + S.dateLabel(S.seoulKey(new Date(state.savedAt))) + ')' : '');
    }
    $('refresh').classList.toggle('warning',warning);
    $('refresh').title = '새로고침 · ' + $('sync-status').textContent;
  }
  function hydrate(payload) {
    var allSchedules = (payload.rows || []).map(S.normalize).filter(function (s) { return s.title; });
    var schedules = allSchedules.filter(function (s) { return s.active; });
    var exceptions = S.normalizeExceptions(payload.exceptions || [],allSchedules);
    var keys = {};
    exceptions.forEach(function (e) {
      var key = e.id + '/' + e.original;
      if (e.issue || keys[key] || !allSchedules.some(function (s) { return s.id === e.id; })) throw new Error('변경사항 입력 확인 필요');
      keys[key] = true;
    });
    var ids = {};
    allSchedules.forEach(function (s) { if (ids[s.id]) throw new Error('일정 ID 중복'); ids[s.id] = true; });
    state.settings = payload.settings || {};
    state.schedules = schedules;
    state.exceptions = exceptions;
    state.warned = state.schedules.some(function (s) { return !!s.issue || !s.time && !s.variable; });
    state.loaded = true; state.savedAt = payload.savedAt;
    renderAll();
  }
  function loadSheet() {
    if (state.busy) return Promise.resolve();
    state.busy = true; $('refresh').disabled = true;
    return fetchJSON(BASE + encodeURIComponent(config.settingsTab)).then(function (rows) {
      if (!Array.isArray(rows)) throw new Error('Invalid settings');
      var settings = S.dictionary(rows);
      var legacy = S.legacyRows(settings);
      legacy.forEach(function (row) {
        var defaults = config.legacyDefaults[row.id] || {};
        Object.keys(defaults).forEach(function (key) { if (!row[key]) row[key] = defaults[key]; });
      });
      var schedules = settings.schedule_tab ? fetchJSON(BASE + encodeURIComponent(settings.schedule_tab)) : Promise.resolve(legacy);
      var exceptions = settings.exceptions_tab ? fetchJSON(BASE + encodeURIComponent(settings.exceptions_tab)) : Promise.resolve(S.legacyExceptions(settings));
      return Promise.all([schedules, exceptions]).then(function (values) {
        if (!Array.isArray(values[0]) || !Array.isArray(values[1])) throw new Error('Invalid schedule data');
        var payload = { settings: settings, rows: values[0], exceptions: values[1], savedAt: Date.now() };
        hydrate(payload); store(CACHE, payload); state.sheetOK = true; state.failureReason = '연결 확인'; updateSync(false); checkAlerts();
      });
    }).catch(function (error) {
      state.sheetOK = false;
      state.failureReason = /변경사항|중복/.test(error.message) ? '시트 입력 확인' : '연결 확인';
      updateSync(true);
      if (!state.loaded) { $('today-events').textContent = '일정을 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해줘.'; }
    }).then(function () { state.busy = false; $('refresh').disabled = false; });
  }
  function upcoming() { return state.events.filter(function (e) { return !e.cancelled && e.date >= today(); }); }
  function departures() {
    return upcoming().filter(function (e) { return e.date === today() && e.time; }).map(function (e) {
      return new Date(new Date(e.date + 'T' + e.time + ':00+09:00').getTime() - e.travel * 60000);
    }).filter(function (d) { return d >= now(); });
  }
  function renderMessage() {
    var quote = S.text(state.settings.quote);
    var applicable = !S.text(state.settings.quote_date) || S.date(state.settings.quote_date) === today();
    var freshWeather = state.weatherOK && Date.now() - state.weatherAt < 30 * 60000;
    $('message-text').style.color = quote && applicable ? state.settings.quote_color || '' : '';
    if (quote && applicable) {
      $('message-text').textContent = quote;
      $('message-source').textContent = '오늘의 한마디' + (S.text(state.settings.author) ? ' · ' + S.text(state.settings.author) : '');
    } else {
      var advice = freshWeather && S.weatherComment(state.weather, now(), departures());
      $('message-text').textContent = advice || (state.weatherStatus === 'loading' ? '날씨를 확인하고 있어. 나가기 전에 비 오는지 보고, 쌀쌀하면 겉옷 챙겨가.' : '날씨 정보를 지금 확인하지 못했어. 나가기 전에 비 오는지 보고, 쌀쌀하면 겉옷 챙겨가.');
      $('message-source').textContent = advice ? '오늘의 한마디 · 날씨를 보고' : state.weatherStatus === 'loading' ? '오늘의 한마디 · 날씨 확인 중' : '오늘의 한마디 · 날씨 확인 필요';
    }
  }
  function loadWeather() {
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + config.latitude + '&longitude=' + config.longitude + '&current=temperature_2m,apparent_temperature,weather_code&hourly=precipitation_probability,apparent_temperature,wind_speed_10m&timezone=Asia%2FSeoul&forecast_days=2';
    return fetchJSON(url).then(function (data) {
      if (!data.current || typeof data.current.temperature_2m !== 'number' || typeof data.current.apparent_temperature !== 'number' || !data.hourly || !Array.isArray(data.hourly.time) || !Array.isArray(data.hourly.precipitation_probability)) throw new Error('Invalid weather');
      state.weather = data; state.weatherAt = Date.now(); state.weatherOK = true;
      state.weatherStatus = 'ready';
      if (window.LegacyTheme) window.LegacyTheme.update(data.current.weather_code,new Date(Date.now() + 9 * 3600000).getUTCHours());
      $('weather-small').textContent = config.locationName + ' · ' + Math.round(data.current.temperature_2m) + '° · 체감 ' + Math.round(data.current.apparent_temperature) + '°';
      renderMessage();
    }).catch(function () {
      state.weatherOK = false; state.weatherStatus = 'error'; $('weather-small').textContent = config.locationName + ' · 날씨 연결 확인 필요'; renderMessage();
    });
  }
  function renderClock() {
    var d = new Date(Date.now() + 9 * 3600000), h = d.getUTCHours();
    $('full-date').textContent = d.getUTCFullYear() + '년 ' + S.dateLabel(today());
    $('day-title').textContent = +today().slice(5,7) + '월 ' + +today().slice(8,10) + '일 (' + ['일','월','화','수','목','금','토'][d.getUTCDay()] + ')';
    clear($('clock')); $('clock').appendChild(el('span','ampm',h < 12 ? '오전' : '오후'));
    $('clock').appendChild(document.createTextNode(String(h % 12 || 12)));
    $('clock').appendChild(el('span','clock-colon',':'));
    $('clock').appendChild(document.createTextNode(String(d.getUTCMinutes()).padStart(2,'0')));
    $('clock').dateTime = new Date().toISOString();
    fitHeader();
  }
  function fitHeader() {
    var header = document.querySelector('.day-header');
    if (!header.getClientRects().length) return;
    if (window.innerWidth <= 620) { $('day-title').style.fontSize = ''; $('clock').style.fontSize = ''; return; }
    $('day-title').style.fontSize = '82px'; $('clock').style.fontSize = '82px';
    var available = header.clientWidth - 50;
    var required = $('day-title').scrollWidth + $('clock').scrollWidth + 22;
    var size = Math.min(82,Math.floor(82 * available / required));
    if (size < 82) { $('day-title').style.fontSize = size + 'px'; $('clock').style.fontSize = size + 'px'; }
  }
  function eventState(e) {
    if (e.cancelled) return { label: '취소', className: '' };
    if (e.needsTime) return { label: '시간 확인 필요', className: 'needs-time' };
    var diff = S.minutesUntil(e.date,e.time,now());
    if (diff <= 0) return { label: '예정 시간 지남', className: 'past' };
    var leave = diff - e.travel;
    if (leave <= 0) return { label: e.travel ? '출발할 시간' : '곧 시작', className: 'urgent' };
    if (leave <= 60) return { label: e.travel ? '출발까지 ' + Math.ceil(leave) + '분' : '시작까지 ' + Math.ceil(diff) + '분', className: 'urgent' };
    return { label: e.changed ? '변경된 일정' : e.date === today() ? '오늘' : S.dateLabel(e.date), className: '' };
  }
  function repeatLabel(e) { return e.weeks ? (e.weeks === 1 ? '매주' : e.weeks + '주마다') : '한 번만'; }
  function openEvent(e) {
    openDialog(e.title, e.cancelled ? '취소된 일정' : e.changed ? '변경된 일정' : repeatLabel(e));
    detailLine('날짜', S.dateLabel(e.date)); detailLine('시간', S.clockLabel(e.time));
    detailLine('알림',e.alerts === false ? '꺼짐' : '1시간 · 30분 · 15분 · 10분 · 5분 전');
    if (e.package) {
      detailLine('수업 회차',e.package.lesson + '/' + e.package.size + ' · 예정 수업 기준');
      detailLine('결제',e.package.paid ? S.dateLabel(e.package.paidOn) + ' 결제한 묶음' : '이 묶음 결제 확인 필요');
      if (e.package.nextDate) detailLine('다음 묶음',S.dateLabel(e.package.nextDate) + ' 수업 전 결제 필요');
    }
    if (e.changed && e.date !== e.original) detailLine('원래 날짜', S.dateLabel(e.original));
    if (e.travel && e.time && !e.cancelled) {
      var leave = new Date(new Date(e.date + 'T' + e.time + ':00+09:00').getTime() - e.travel * 60000 + 9 * 3600000);
      var leaveTime = String(leave.getUTCHours()).padStart(2,'0') + ':' + String(leave.getUTCMinutes()).padStart(2,'0');
      detailLine('출발', S.dateLabel(S.dateKey(leave)) + ' ' + S.clockLabel(leaveTime) + ' · 준비·이동 ' + e.travel + '분');
    }
    if (e.contact) {
      var phone = e.contact.replace(/[^\d+]/g,'');
      var line = detailLine('연락처','');
      if (phone) { var link = el('a','',e.contact); link.href = 'tel:' + phone; line.appendChild(link); } else line.appendChild(document.createTextNode(e.contact));
    }
    if (e.memo) detailLine('메모',e.memo);
  }
  function row(e, isToday) {
    var status = isToday ? eventState(e) : null;
    var button = el('button','event-row' + (isToday ? ' today-event ' + status.className : ''));
    var diff = Math.round((new Date(e.date + 'T00:00:00Z') - new Date(today() + 'T00:00:00Z')) / 86400000);
    var dday = diff === 0 ? 'D-day' : diff > 0 ? 'D-' + diff : '지난 일정';
    var date = el('span','row-date',+e.date.slice(5,7) + '월 ' + +e.date.slice(8,10) + '일');
    date.appendChild(el('small','','(' + ['일','월','화','수','목','금','토'][S.weekday(e.date)] + ')'));
    button.appendChild(el('span','row-dday',isToday ? '오늘' : dday)); button.appendChild(date);
    button.appendChild(el('span','row-time' + (e.needsTime ? ' needs-time' : ''),S.clockLabel(e.time)));
    button.appendChild(el('span','row-title',e.title));
    button.appendChild(el('span','row-meta',repeatLabel(e) + (e.changed ? ' · 변경' : '')));
    if (e.package && (!e.package.paid || e.package.lesson === e.package.size)) {
      button.appendChild(el('span','package-reminder',!e.package.paid ? '이번 묶음 결제 확인 필요' : e.package.nextDate ? S.dateLabel(e.package.nextDate) + ' 수업 전 다음 묶음 결제' : '이번 묶음 마지막 수업'));
    }
    if (isToday && (status.className === 'urgent' || status.className === 'past' || e.travel && e.time)) {
      var reminder = status.className === 'urgent' || status.className === 'past' ? status.label : '';
      if (e.travel && e.time && status.className !== 'past') {
        var leave = new Date(new Date(e.date + 'T' + e.time + ':00+09:00').getTime() - e.travel * 60000 + 9 * 3600000);
        var departure = S.clockLabel(String(leave.getUTCHours()).padStart(2,'0') + ':' + String(leave.getUTCMinutes()).padStart(2,'0')) + ' 출발';
        reminder = reminder ? reminder + ' · ' + departure : departure;
      }
      button.appendChild(el('span','row-reminder',reminder));
    }
    button.addEventListener('click',function () { openEvent(e); }); return button;
  }
  function renderList(id, events, emptyText) {
    var list = $(id); clear(list);
    if (!events.length) list.appendChild(el('p','empty',emptyText));
    else events.forEach(function (e) { list.appendChild(row(e)); });
  }
  function renderSchedules() {
    var items = S.agenda(state.events,now());
    var todays = items.filter(function (e) { return e.date === today(); });
    todays.sort(function (a,b) {
      var aPast = a.time && S.minutesUntil(a.date,a.time,now()) <= 0;
      var bPast = b.time && S.minutesUntil(b.date,b.time,now()) <= 0;
      return Number(aPast) - Number(bPast) || (a.time || '99:99').localeCompare(b.time || '99:99');
    });
    var target = $('today-events'); clear(target);
    $('today-count').textContent = todays.length ? todays.length + '개' : '';
    if (todays.length) todays.forEach(function (e) { target.appendChild(row(e,true)); });
    else {
      var empty = el('div','empty-today'); empty.appendChild(el('h3','', '오늘은 예정된 일정이 없어요'));
      empty.appendChild(el('p','', '다가오는 일정은 아래에서 확인해줘.')); target.appendChild(empty);
    }
    var end = S.addDays(S.weekStart(today()),6);
    $('week-range').textContent = shortDate(S.weekStart(today())) + ' — ' + shortDate(end);
    renderList('week-events',items.filter(function (e) { return e.date > today() && e.date <= end; }), '이번 주 남은 일정은 없어요.');
    renderList('later-events',items.filter(function (e) { return e.date > end && e.date <= S.addDays(today(),28); }), '이후 예정된 일정은 없어요.');
    var pending = state.schedules.filter(function (s) { return !!s.issue; });
    $('pending-section').hidden = !pending.length; clear($('pending-events'));
    pending.forEach(function (s) {
      var button = el('button','event-row'); button.style.gridTemplateColumns = 'minmax(0,1fr)';
      var content = el('span',''); content.appendChild(el('span','row-title',s.title)); content.appendChild(el('span','row-meta',s.issue));
      button.appendChild(content); button.addEventListener('click',function () { openDialog(s.title,'예약 확인'); detailLine('확인할 내용',s.issue); if (s.contact) detailLine('연락처',s.contact); if (s.memo) detailLine('메모',s.memo); });
      $('pending-events').appendChild(button);
    });
  }
  function renderStrip() {
    clear($('weekly-row')); var start = S.weekStart(today());
    for (var i = 0; i < 7; i++) {
      var key = S.addDays(start,i);
      var day = el('span','strip-day' + (key === today() ? ' today' : '') + (i === 6 ? ' sunday' : ''));
      day.appendChild(el('span','weekday',['월','화','수','목','금','토','일'][i]));
      day.appendChild(el('span','strip-date',shortDate(key)));
      day.appendChild(el('span','strip-dot' + (state.events.some(function (e) { return e.date === key && !e.cancelled; }) ? '' : ' blank')));
      $('weekly-row').appendChild(day);
    }
  }
  function calendarBounds() {
    var anchor = state.calendarDate;
    if (state.calendarMode === 1) { var start = S.weekStart(anchor); return { start: start, end: S.addDays(start,6), count: 7 }; }
    var first = anchor.slice(0,7) + '-01';
    var next = new Date(first + 'T00:00:00Z'); next.setUTCMonth(next.getUTCMonth() + 1);
    var last = S.addDays(S.dateKey(next),-1), begin = S.weekStart(first);
    var count = Math.ceil((new Date(last + 'T00:00:00Z') - new Date(begin + 'T00:00:00Z')) / 86400000 / 7 + 1/7) * 7;
    return { start: begin, end: S.addDays(begin,count-1), count: count };
  }
  function openDay(key, events) {
    openDialog(S.dateLabel(key),'하루 일정');
    if (!events.length) detailLine('일정','예정된 일정이 없어요.');
    events.forEach(function (e) { var button = row(e); if (e.cancelled) { button.style.opacity = '.55'; button.querySelector('.row-meta').textContent = '취소'; } $('detail-content').appendChild(button); });
  }
  function renderCalendar() {
    $('dashboard').classList.toggle('calendar-open',state.calendarMode !== 0);
    $('calendar-panel').hidden = state.calendarMode === 0;
    $('weekly-toggle').setAttribute('aria-expanded',String(state.calendarMode !== 0));
    $('weekly-toggle').title = state.calendarMode === 0 ? '주간 달력 열기' : state.calendarMode === 1 ? '월간 달력 열기' : '달력 접기';
    if (!state.calendarMode) { fitHeader(); return; }
    var range = calendarBounds();
    var events = S.expand(state.schedules,state.exceptions,range.start,range.end);
    $('calendar-title').textContent = state.calendarMode === 1 ? S.dateLabel(range.start) + ' — ' + shortDate(range.end) : +state.calendarDate.slice(0,4) + '년 ' + +state.calendarDate.slice(5,7) + '월';
    $('calendar-mode-label').textContent = state.calendarMode === 1 ? '주간 일정' : '월간 일정';
    $('mode-week').setAttribute('aria-pressed',String(state.calendarMode === 1));
    $('mode-month').setAttribute('aria-pressed',String(state.calendarMode === 2));
    var grid = $('calendar-grid'); clear(grid);
    ['월','화','수','목','금','토','일'].forEach(function (d) { grid.appendChild(el('div','calendar-weekday',d)); });
    for (var i = 0; i < range.count; i++) {
      (function (key) {
        var items = events.filter(function (e) { return e.date === key; });
        var cell = el('div','calendar-cell' + (key === today() ? ' today' : '') + (key.slice(0,7) !== state.calendarDate.slice(0,7) && state.calendarMode === 2 ? ' outside' : '') + (S.weekday(key) === 0 ? ' sunday' : ''));
        var dateButton = el('button','day-number',state.calendarMode === 1 ? shortDate(key) : +key.slice(8,10));
        dateButton.setAttribute('aria-label',S.dateLabel(key) + ' 일정 ' + items.length + '개');
        dateButton.addEventListener('click',function () { openDay(key,items); }); cell.appendChild(dateButton);
        var visible = state.calendarMode === 1 ? items : items.slice(0,2);
        visible.forEach(function (e) {
          var button = el('button','calendar-event' + (e.cancelled ? ' cancelled' : e.needsTime ? ' unconfirmed' : ''));
          if (state.calendarMode === 1) button.appendChild(el('span','cal-time',e.cancelled ? '취소' : S.clockLabel(e.time)));
          button.appendChild(el('span','',e.title)); button.title = S.clockLabel(e.time) + ' ' + e.title;
          button.addEventListener('click',function () { openEvent(e); }); cell.appendChild(button);
        });
        if (items.length > visible.length) { var more = el('button','calendar-more','+' + (items.length - visible.length)); more.addEventListener('click',function () { openDay(key,items); }); cell.appendChild(more); }
        grid.appendChild(cell);
      }(S.addDays(range.start,i)));
    }
  }
  function moveCalendar(direction) {
    if (state.calendarMode === 1) state.calendarDate = S.addDays(state.calendarDate,direction * 7);
    else { var d = new Date(state.calendarDate.slice(0,7) + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + direction); state.calendarDate = S.dateKey(d); }
    renderCalendar();
  }
  function renderFacilities() {
    var day = S.weekday(today());
    $('library-hours').textContent = state.settings.library_hours || (day === 0 || day === 1 ? '오늘 휴관 · 운영시간 재확인' : day === 6 ? '10:00–18:00 · 기존 안내 기준' : '10:00–19:00 · 기존 안내 기준');
    var rows = $('facility-panel').children;
    rows[0].querySelector('span').textContent = state.settings.gym_status || '운영 중단';
    rows[1].querySelector('span').textContent = state.settings.roof_status || '폐쇄';
  }
  function renderAll() {
    state.events = S.expand(state.schedules,state.exceptions,S.weekStart(today()),S.addDays(today(),42));
    renderClock(); renderStrip(); renderCalendar(); if (state.loaded) renderSchedules(); renderMessage(); renderFacilities();
    if (window.LegacyTheme) window.LegacyTheme.update(state.weatherOK && state.weather ? state.weather.current.weather_code : 0,new Date(Date.now() + 9 * 3600000).getUTCHours());
  }
  function openDialog(title,label) {
    if ($('detail-overlay').hidden) state.focus = document.activeElement;
    $('detail-title').textContent = title; $('detail-label').textContent = label; clear($('detail-content'));
    $('detail-overlay').hidden = false; $('detail-close').focus();
  }
  function detailLine(label,content) { var line = el('div','detail-line'); line.appendChild(el('small','',label)); line.appendChild(document.createTextNode(content)); $('detail-content').appendChild(line); return line; }
  function closeDialog() { $('detail-overlay').hidden = true; if (state.focus && document.contains(state.focus)) state.focus.focus(); }
  function chime() {
    if (!state.sound || !state.audio) return;
    try {
      if (state.audio.resume) { var resumed = state.audio.resume(); if (resumed && resumed.catch) resumed.catch(function () {}); }
      [523,659,784].forEach(function (freq,i) {
        var oscillator = state.audio.createOscillator(), gain = state.audio.createGain(), t = state.audio.currentTime + i * .2;
        oscillator.connect(gain); gain.connect(state.audio.destination); oscillator.frequency.value = freq;
        gain.gain.setValueAtTime(0,t); gain.gain.linearRampToValueAtTime(.13,t+.02); gain.gain.exponentialRampToValueAtTime(.001,t+.45);
        oscillator.start(t); oscillator.stop(t+.5);
      });
    } catch (e) {}
  }
  function speak(text) {
    if (!state.sound) return;
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { chime(); return; }
    try {
      var utterance = new SpeechSynthesisUtterance('지운아. ' + text);
      utterance.lang = 'ko-KR'; utterance.rate = .95; utterance.pitch = 1; utterance.volume = 1;
      var voices = window.speechSynthesis.getVoices().filter(function (voice) { return /^ko(?:-|$)/i.test(voice.lang.replace('_','-')); });
      var local = voices.filter(function (voice) { return voice.localService; });
      if (voices.length) utterance.voice = local[0] || voices[0];
      state.speech.push(utterance);
      function release() { state.speech = state.speech.filter(function (item) { return item !== utterance; }); }
      utterance.onend = release;
      utterance.onerror = function (event) {
        release();
        if (!state.sound) return;
        if (event.error === 'not-allowed') { state.soundBlocked = true; renderSoundButton(); }
        else if (event.error !== 'canceled' && event.error !== 'interrupted') chime();
      };
      window.speechSynthesis.speak(utterance);
    } catch (e) { chime(); }
  }
  function checkAlerts() {
    if (!state.loaded || !state.sheetOK || Date.now() - state.savedAt > 5 * 60000) return;
    var candidates = S.dueAlerts(state.events,notified,now());
    if (!candidates.length) return;
    candidates.forEach(function (c) { notified[c.id] = today(); }); store(CACHE + '-alerts',notified);
    $('alert-title').textContent = candidates.map(function (c) { return c.event.title; }).join(' · ');
    $('alert-text').textContent = candidates.map(function (c) { return '시작까지 ' + c.mins + '분 · ' + S.clockLabel(c.event.time); }).join(' / ');
    state.lastAlertText = candidates.map(S.alertSpeech).join(' ');
    $('alert').hidden = false; speak(state.lastAlertText);
  }
  function renderSoundButton() {
    var label = state.sound ? state.soundBlocked ? '음성 알림 활성화' : '음성 알림 끄기' : '음성 알림 켜기';
    $('sound-toggle').title = label; $('sound-toggle').setAttribute('aria-label',label);
    $('sound-toggle').setAttribute('aria-pressed',String(state.sound));
    $('sound-toggle').classList.toggle('needs-activation',state.sound && state.soundBlocked);
    clear($('sound-toggle')); var icon = el('i');
    icon.setAttribute('data-lucide',state.sound && !state.soundBlocked ? 'volume-2' : 'volume-x');
    $('sound-toggle').appendChild(icon); icons();
  }
  function activateSound() {
    if (!state.sound) return;
    try { if (!state.audio) { var Audio = window.AudioContext || window.webkitAudioContext; if (Audio) state.audio = new Audio(); } } catch (e) {}
    try { if (state.audio && state.audio.resume) { var resumed = state.audio.resume(); if (resumed && resumed.catch) resumed.catch(function () {}); } } catch (e) {}
    if (state.soundBlocked) {
      state.soundBlocked = false; renderSoundButton();
      var due = state.sheetOK && Date.now() - state.savedAt <= 5 * 60000 ? S.dueAlerts(state.events,{},now()) : [];
      speak(due.length ? due.map(S.alertSpeech).join(' ') : '음성 알림을 켰어. 알림을 체크한 일정은 1시간 전부터 알려줄게.');
    }
  }
  $('weekly-toggle').addEventListener('click',function () { if (!state.calendarMode) state.calendarDate = today(); state.calendarMode = (state.calendarMode + 1) % 3; renderCalendar(); });
  $('mode-week').addEventListener('click',function () { state.calendarMode = 1; renderCalendar(); });
  $('mode-month').addEventListener('click',function () { state.calendarMode = 2; renderCalendar(); });
  $('calendar-close').addEventListener('click',function () { state.calendarMode = 0; renderCalendar(); $('weekly-toggle').focus(); });
  $('calendar-prev').addEventListener('click',function () { moveCalendar(-1); });
  $('calendar-next').addEventListener('click',function () { moveCalendar(1); });
  $('calendar-today').addEventListener('click',function () { state.calendarDate = today(); renderCalendar(); });
  $('facility-toggle').addEventListener('click',function () { $('facility-panel').hidden = !$('facility-panel').hidden; $('facility-toggle').setAttribute('aria-expanded',String(!$('facility-panel').hidden)); });
  $('detail-close').addEventListener('click',closeDialog);
  $('detail-overlay').addEventListener('click',function (e) { if (e.target === $('detail-overlay')) closeDialog(); });
  document.addEventListener('keydown',function (e) {
    if ($('detail-overlay').hidden) return;
    if (e.key === 'Escape') closeDialog();
    if (e.key === 'Tab') {
      var controls = $('detail-dialog').querySelectorAll('button, a[href]');
      var first = controls[0], last = controls[controls.length-1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  $('alert-close').addEventListener('click',function () { $('alert').hidden = true; });
  $('refresh').addEventListener('click',function () { loadSheet(); loadWeather(); });
  $('sound-toggle').addEventListener('click',function () {
      if (state.sound && state.soundBlocked) { activateSound(); return; }
      state.sound = !state.sound;
      store(CACHE + '-sound',state.sound);
      if (state.sound) {
        activateSound();
        var due = state.sheetOK && Date.now() - state.savedAt <= 5 * 60000 ? S.dueAlerts(state.events,{},now()) : [];
        speak(!$('alert').hidden && due.length ? due.map(S.alertSpeech).join(' ') : '음성 알림을 켰어. 알림을 체크한 일정은 1시간 전부터 알려줄게.');
      } else { state.soundBlocked = false; if (window.speechSynthesis) { window.speechSynthesis.cancel(); state.speech = []; } }
      renderSoundButton();
  });
  state.sound = read(CACHE + '-sound') !== false;
  renderSoundButton();
  function soundGesture(event) { if (!$('sound-toggle').contains(event.target)) activateSound(); }
  document.addEventListener('click',soundGesture);
  document.addEventListener('keydown',soundGesture);
  notified = read(CACHE + '-alerts') || {};
  Object.keys(notified).forEach(function (key) { if (notified[key] < S.addDays(today(),-1)) delete notified[key]; });
  var cached = read(CACHE);
  if (cached && Array.isArray(cached.rows) && cached.savedAt) { try { hydrate(cached); updateSync(true); } catch (e) {} }
  renderAll(); icons(); loadSheet(); loadWeather();
  setInterval(function () { renderAll(); updateSync(false); },30000);
  setInterval(checkAlerts,10000);
  setInterval(loadSheet,60000); setInterval(loadWeather,600000);
  document.addEventListener('visibilitychange',function () { if (!document.hidden) { renderAll(); loadSheet(); loadWeather(); } });
  window.addEventListener('online',function () { loadSheet(); loadWeather(); });
  window.addEventListener('resize',fitHeader);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitHeader);
}());
