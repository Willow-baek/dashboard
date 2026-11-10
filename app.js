(function () {
  'use strict';
  var S = window.Schedule;
  var B = window.DashboardBriefing;
  var briefingUid = null, briefingOpen = false, briefingReading = false;
  var P = window.DashboardPayments, paymentReceipts = [], paymentBusy = false;
  var backgroundTestTimer = null;
  var config = window.DashboardConfig;
  var SHEET_ID = config.sheetId;
  var BASE = 'https://opensheet.elk.sh/' + SHEET_ID + '/';
  var CACHE = 'home-dashboard-v2';
  var state = { settings: {}, schedules: [], exceptions: [], events: [], loaded: false, savedAt: 0,
    calendarMode: 0, calendarDate: S.seoulKey(new Date()), weather: null, weatherAt: 0, weatherOK: false, weatherStatus: 'loading',
    busy: false, sound: true, soundBlocked: false, audio: null, speech: [], lastAlertText: '', facilityDetail:'', focus: null, warned: false, sheetOK: false, failureReason: '연결 확인' };
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
  function fitMessage() {
    var viewport = document.querySelector('.message-copy'), track = document.querySelector('.message-track');
    var overflow = Math.max(0,track.scrollWidth - viewport.clientWidth);
    viewport.style.setProperty('--message-offset',-overflow + 'px');
    viewport.style.setProperty('--message-duration',Math.max(16,overflow / 25 * 2 + 6) + 's');
    viewport.classList.toggle('is-scrolling',overflow > 1);
  }
  function renderMessage() {
    var comeback = B.countdown(state.settings,config.returnCountdown,now());
    $('return-countdown').hidden = !comeback;
    document.querySelector('.message-band').classList.toggle('comeback-band',!!comeback);
    var quote = S.text(state.settings.quote);
    var applicable = !S.text(state.settings.quote_date) || S.date(state.settings.quote_date) === today();
    if (comeback) {
      $('return-countdown').textContent = comeback.label;
      $('message-text').textContent = quote && applicable ? quote : comeback.message;
      $('message-text').style.color = quote && applicable ? state.settings.quote_color || '' : '';
      $('message-source').textContent = '귀국 예정일 ' + comeback.date + ' · 한국 날짜 기준';
      fitMessage();
      return;
    }
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
    fitMessage();
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
    if (window.innerWidth <= 620) {
      $('day-title').style.fontSize = ''; $('clock').style.fontSize = '';
      var mobileAvailable = header.clientWidth - 24;
      if ($('day-title').scrollWidth > mobileAvailable) $('day-title').style.fontSize = Math.floor(38 * mobileAvailable / $('day-title').scrollWidth) + 'px';
      return;
    }
    $('day-title').style.fontSize = '82px'; $('clock').style.fontSize = '82px';
    var available = header.clientWidth - 50;
    var required = $('day-title').scrollWidth + $('clock').scrollWidth + 22;
    var size = Math.min(82,Math.floor(82 * available / required));
    if (size < 82) { $('day-title').style.fontSize = size + 'px'; $('clock').style.fontSize = size + 'px'; }
  }
  function eventState(e) {
    if (e.cancelled) return { label: '취소', className: '' };
    if (S.isOngoing(e,now())) return { label:'진행 중', className:'ongoing' };
    if (e.needsTime) return { label: '시간 확인 필요', className: 'needs-time' };
    var diff = S.minutesUntil(e.date,e.time,now());
    if (diff <= 0) return { label: '예정 시간 지남', className: 'past' };
    var leave = diff - e.travel;
    if (leave <= 0) return { label: e.travel ? '출발할 시간' : '곧 시작', className: 'urgent' };
    if (leave <= 60) return { label: e.travel ? '출발까지 ' + Math.ceil(leave) + '분' : '시작까지 ' + Math.ceil(diff) + '분', className: 'urgent' };
    return { label: e.changed ? '변경된 일정' : e.date === today() ? '오늘' : S.dateLabel(e.date), className: '' };
  }
  function repeatLabel(e) { return e.endDate ? '기간 일정' : e.weeks ? (e.weeks === 1 ? '매주' : e.weeks + '주마다') : '한 번만'; }
  function eventTimeLabel(e) { return e.endDate && !e.time ? '시간 지정 없음' : S.clockLabel(e.time); }
  function openEvent(e) {
    openDialog(e.title, e.cancelled ? '취소된 일정' : e.changed ? '변경된 일정' : repeatLabel(e));
    detailLine(e.endDate ? '시작일' : '날짜', S.dateLabel(e.date));
    if (e.endDate) detailLine('끝나는 날',S.dateLabel(e.endDate) + '까지');
    detailLine(e.endDate ? '시작 시간' : '시간',eventTimeLabel(e));
    detailLine('알림',e.alerts === false ? '꺼짐' : !e.time ? '시간이 없어 알림 없음' : (e.endDate ? '시작 전만 · ' : '') + (e.travel ? '준비·출발 기준 · ' : '시작 기준 · ') + '1시간 · 30분 · 15분 · 10분 · 5분 전' + (e.travel ? ' · 출발할 때' : ''));
    if (e.package) {
      detailLine('수업 회차',e.package.lesson + '/' + e.package.size + ' · 예정 수업 기준');
      detailLine('결제',e.package.paid ? S.dateLabel(e.package.paidOn) + ' 결제한 묶음' : '이 묶음 결제 확인 필요');
      if (e.package.nextDate) detailLine('다음 묶음',S.dateLabel(e.package.nextDate) + ' 수업 전 결제 필요');
      var instruction = config.payments && config.payments.instructions[e.id];
      if (instruction && instruction.amount) detailLine('묶음 금액',Number(instruction.amount).toLocaleString('ko-KR') + '원 · ' + e.package.size + '회 · ' + instruction.method);
      if (instruction) detailLine('결제 방법',instruction.detail);
    }
    if (e.changed && e.date !== e.original) detailLine('원래 날짜', S.dateLabel(e.original));
    if (e.travel && e.time && !e.cancelled) {
      var leave = S.departure(e);
      detailLine('준비·출발', S.dateLabel(leave.date) + ' ' + S.clockLabel(leave.time) + ' · 준비·이동 ' + e.travel + '분');
    }
    if (e.contact) {
      var phone = e.contact.replace(/[^\d+]/g,'');
      var line = detailLine('연락처','');
      if (phone) { var link = el('a','',e.contact); link.href = 'tel:' + phone; line.appendChild(link); } else line.appendChild(document.createTextNode(e.contact));
    }
    if (e.memo) detailLine('메모',e.memo);
    if (!e.cancelled && S.coversDay(e,today())) attachBriefing(e.uid,false);
  }
  function briefingModel() { return B.build(state.events,now(),briefingUid); }
  function briefingWarning() {
    if (!state.loaded) return '일정을 아직 불러오지 못했어. 새로고침하고 다시 확인해줘.';
    if (!state.sheetOK || Date.now() - state.savedAt > 5 * 60000) return '최근 일정 연결을 확인하지 못했어. 마지막으로 저장된 일정 기준이니 변경사항을 확인해줘.';
    return '';
  }
  function readBriefing() {
    if (!state.sound) return;
    if (window.speechSynthesis) { window.speechSynthesis.cancel(); state.speech = []; }
    briefingReading = true;
    speak((briefingWarning() ? briefingWarning() + ' ' : '') + (state.loaded ? briefingModel().speech : ''));
  }
  function updateBriefing() {
    if (!briefingOpen || $('detail-overlay').hidden) return;
    var model = briefingModel(), warning = briefingWarning();
    $('briefing-countdown').textContent = state.loaded ? model.headline : '일정 불러오는 중';
    $('briefing-warning').textContent = warning;
    $('briefing-warning').hidden = !warning;
    $('briefing-voice-note').textContent = !state.sound ? '음성이 꺼져 있어. 아래 버튼으로 켜고 들을 수 있어.' : state.soundBlocked ? '브라우저가 음성을 막았어. 아래 버튼을 다시 눌러줘.' : !window.speechSynthesis ? '이 브라우저는 음성 읽기를 지원하지 않아. 화면으로 확인해줘.' : '오늘 일정을 시간순으로 읽어줘.';
    $('briefing-read').textContent = state.sound ? '브리핑 다시 듣기' : '음성 켜고 브리핑 듣기';
    $('briefing-read').disabled = !state.loaded || !window.speechSynthesis;
    if ($('briefing-list')) {
      var signature = JSON.stringify(model.items.map(function (e) { return [e.uid,e.time,e.title,e.endDate]; }));
      if ($('briefing-list').getAttribute('data-events') !== signature) {
        clear($('briefing-list'));
        if (!model.items.length) $('briefing-list').appendChild(el('p','briefing-empty','오늘은 등록된 일정이 없어.'));
        model.items.forEach(function (e) {
          var button = el('button','briefing-event');
          button.appendChild(el('span','briefing-time',S.isOngoing(e,now()) ? '진행 중' : e.time ? S.clockLabel(e.time) : e.endDate ? '기간 일정' : '시간 미정'));
          button.appendChild(el('strong','',e.title));
          button.appendChild(el('span','briefing-status',B.status(e,now())));
          button.setAttribute('data-event-uid',e.uid);
          button.addEventListener('click',function () { openEvent(e); });
          $('briefing-list').appendChild(button);
        });
        $('briefing-list').setAttribute('data-events',signature);
      }
      Array.prototype.forEach.call($('briefing-list').querySelectorAll('[data-event-uid]'),function (button) {
        var event = model.items.filter(function (e) { return e.uid === button.getAttribute('data-event-uid'); })[0];
        if (event) button.querySelector('.briefing-status').textContent = B.status(event,now());
      });
    }
  }
  function attachBriefing(uid,showList) {
    briefingUid = uid || null; briefingOpen = true;
    var section = el('section','briefing-panel');
    section.setAttribute('aria-label','오늘 일정 브리핑');
    if (!showList) section.appendChild(el('h3','','오늘 일정 브리핑'));
    var countdown = el('p','briefing-countdown'); countdown.id = 'briefing-countdown'; section.appendChild(countdown);
    var warning = el('p','briefing-warning'); warning.id = 'briefing-warning'; section.appendChild(warning);
    if (showList) { var list = el('div'); list.id = 'briefing-list'; section.appendChild(list); }
    var note = el('p','briefing-voice-note'); note.id = 'briefing-voice-note'; section.appendChild(note);
    var button = el('button','text-button briefing-read'); button.id = 'briefing-read';
    button.addEventListener('click',function () {
      if (!state.sound) { state.sound = true; store(CACHE + '-sound',true); renderSoundButton(); }
      activateSound(); readBriefing(); updateBriefing();
    }); section.appendChild(button);
    $('detail-content').insertBefore(section,$('detail-content').firstChild);
    updateBriefing();
    if (state.loaded) { activateSound(); readBriefing(); }
  }
  function openTodayBriefing() { openDialog('오늘 일정 브리핑',S.dateLabel(today())); attachBriefing(null,true); }
  function row(e, isToday) {
    var status = isToday ? eventState(e) : null;
    var button = el('button','event-row' + (isToday ? ' today-event ' + status.className : ''));
    var diff = Math.round((new Date(e.date + 'T00:00:00Z') - new Date(today() + 'T00:00:00Z')) / 86400000);
    var dday = diff === 0 ? 'D-day' : diff > 0 ? 'D-' + diff : '지난 일정';
    var ongoing = S.isOngoing(e,now());
    var date = el('span','row-date' + (e.endDate ? ' period-date' : ''),e.endDate ? S.periodLabel(e.date,e.endDate) : +e.date.slice(5,7) + '월 ' + +e.date.slice(8,10) + '일');
    if (!e.endDate) date.appendChild(el('small','','(' + ['일','월','화','수','목','금','토'][S.weekday(e.date)] + ')'));
    button.appendChild(el('span','row-dday',ongoing ? '진행 중' : isToday ? '오늘' : dday)); button.appendChild(date);
    button.appendChild(el('span','row-time' + (e.endDate ? ' period-time' : '') + (e.needsTime ? ' needs-time' : ''),ongoing ? S.periodLabel(e.endDate,e.endDate) + '까지' : e.endDate && !e.time ? '기간 일정' : eventTimeLabel(e)));
    button.appendChild(el('span','row-title',e.title));
    button.appendChild(el('span','row-meta',repeatLabel(e) + (e.changed ? ' · 변경' : '')));
    // Payment reminders live together above the schedule, not duplicated on every lesson.
    if (isToday && !ongoing && (status.className === 'urgent' || status.className === 'past' || e.travel && e.time)) {
      var reminder = status.className === 'urgent' || status.className === 'past' ? status.label : '';
      if (e.travel && e.time && status.className !== 'past') {
        var leave = S.departure(e);
        var departureLabel = S.clockLabel(leave.time) + ' 준비·출발';
        reminder = reminder ? reminder + ' · ' + departureLabel : departureLabel;
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
    renderPayments();
    var items = S.agenda(state.events,now());
    var todays = items.filter(function (e) { return S.coversDay(e,today()); });
    todays.sort(function (a,b) {
      var aPast = !S.isOngoing(a,now()) && a.time && S.minutesUntil(a.date,a.time,now()) <= 0;
      var bPast = !S.isOngoing(b,now()) && b.time && S.minutesUntil(b.date,b.time,now()) <= 0;
      return Number(aPast) - Number(bPast) || (a.time || '99:99').localeCompare(b.time || '99:99');
    });
    var target = $('today-events'); clear(target);
    $('today-count').textContent = todays.length ? todays.length + '개' : '';
    document.querySelector('.today-section').hidden = !todays.length;
    todays.forEach(function (e) { target.appendChild(row(e,true)); });
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
      day.appendChild(el('span','strip-dot' + (state.events.some(function (e) { return S.coversDay(e,key) && !e.cancelled; }) ? '' : ' blank')));
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
    $('dashboard').classList.toggle('calendar-open',state.calendarMode === 2);
    $('dashboard').classList.toggle('calendar-week',state.calendarMode === 1);
    $('calendar-panel').hidden = state.calendarMode === 0;
    $('weekly-toggle').setAttribute('aria-expanded',String(state.calendarMode !== 0));
    $('weekly-toggle').title = state.calendarMode === 0 ? '주간 달력 열기' : state.calendarMode === 1 ? '월간 달력 열기' : '달력 접기';
    if (!state.calendarMode) { fitHeader(); return; }
    var range = calendarBounds();
    var events = S.expand(displaySchedules(),state.exceptions,range.start,range.end);
    $('calendar-title').textContent = state.calendarMode === 1 ? S.dateLabel(range.start) + ' — ' + shortDate(range.end) : +state.calendarDate.slice(0,4) + '년 ' + +state.calendarDate.slice(5,7) + '월';
    $('calendar-mode-label').textContent = state.calendarMode === 1 ? '주간 일정' : '월간 일정';
    $('mode-week').setAttribute('aria-pressed',String(state.calendarMode === 1));
    $('mode-month').setAttribute('aria-pressed',String(state.calendarMode === 2));
    var grid = $('calendar-grid'); clear(grid);
    ['월','화','수','목','금','토','일'].forEach(function (d) { grid.appendChild(el('div','calendar-weekday',d)); });
    for (var i = 0; i < range.count; i++) {
      (function (key) {
        var items = events.filter(function (e) { return S.coversDay(e,key); });
        var cell = el('div','calendar-cell' + (key === today() ? ' today' : '') + (key.slice(0,7) !== state.calendarDate.slice(0,7) && state.calendarMode === 2 ? ' outside' : '') + (S.weekday(key) === 0 ? ' sunday' : ''));
        var dateButton = el('button','day-number',state.calendarMode === 1 ? shortDate(key) : +key.slice(8,10));
        dateButton.setAttribute('aria-label',S.dateLabel(key) + ' 일정 ' + items.length + '개');
        dateButton.addEventListener('click',function () { openDay(key,items); }); cell.appendChild(dateButton);
        var visible = state.calendarMode === 1 ? items : items.slice(0,2);
        visible.forEach(function (e) {
          var button = el('button','calendar-event' + (e.endDate ? ' period-event' : '') + (e.cancelled ? ' cancelled' : e.needsTime ? ' unconfirmed' : ''));
          if (state.calendarMode === 1) button.appendChild(el('span','cal-time',e.cancelled ? '취소' : e.endDate && key !== e.date ? '기간 일정' : eventTimeLabel(e)));
          button.appendChild(el('span','',e.title)); button.title = (e.endDate ? S.periodLabel(e.date,e.endDate) : eventTimeLabel(e)) + ' ' + e.title;
          button.addEventListener('click',function () { openEvent(e); }); cell.appendChild(button);
        });
        if (items.length > visible.length) { var more = el('button','calendar-more','+' + (items.length - visible.length)); more.addEventListener('click',function () { openDay(key,items); }); cell.appendChild(more); }
        grid.appendChild(cell);
      }(S.addDays(range.start,i)));
    }
    fitHeader();
  }
  function moveCalendar(direction) {
    if (state.calendarMode === 1) state.calendarDate = S.addDays(state.calendarDate,direction * 7);
    else { var d = new Date(state.calendarDate.slice(0,7) + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + direction); state.calendarDate = S.dateKey(d); }
    renderCalendar();
  }
  function renderFacilities() {
    ['gym','roof','library'].forEach(function (id) {
      var info = window.Facilities.info(id,state.settings,now());
      $(id === 'library' ? 'library-hours' : id + '-summary').textContent = info.membership || info.status.replace(' · 기존 시간표 기준','');
    });
    if (state.facilityDetail && !$('detail-overlay').hidden) renderFacilityDetail(state.facilityDetail);
  }
  function renderFacilityDetail(id) {
    var info = window.Facilities.info(id,state.settings,now()); clear($('detail-content'));
    detailLine('현재 상태',info.status);
    if (info.membership) detailLine('지운이 회원권',info.membership);
    info.hours.forEach(function (line) { detailLine(line[0] + ' 운영시간',line[1]); });
    detailLine('안내 기준',info.basis);
  }
  function openFacility(id) {
    openDialog(window.Facilities.info(id,state.settings,now()).name,'운영시간 · 현재 상태');
    state.facilityDetail = id; renderFacilityDetail(id);
  }
  function renderAll() {
    state.events = S.expand(displaySchedules(),state.exceptions,S.weekStart(today()),S.addDays(today(),42));
    renderClock(); renderStrip(); renderCalendar(); if (state.loaded) renderSchedules(); renderMessage(); renderFacilities();
    $('today-briefing').disabled = !state.loaded;
    updateBriefing();
    if (window.LegacyTheme) window.LegacyTheme.update(state.weatherOK && state.weather ? state.weather.current.weather_code : 0,new Date(Date.now() + 9 * 3600000).getUTCHours());
  }
  function openDialog(title,label) {
    stopBriefing();
    state.facilityDetail = '';
    if ($('detail-overlay').hidden) state.focus = document.activeElement;
    $('detail-title').textContent = title; $('detail-label').textContent = label; clear($('detail-content'));
    $('detail-overlay').hidden = false; $('detail-close').focus();
  }
  function detailLine(label,content) { var line = el('div','detail-line'); line.appendChild(el('small','',label)); line.appendChild(document.createTextNode(content)); $('detail-content').appendChild(line); return line; }
  function stopBriefing() {
    if (briefingReading && window.speechSynthesis) { window.speechSynthesis.cancel(); state.speech = []; }
    briefingUid = null; briefingOpen = false; briefingReading = false;
  }
  function closeDialog() { stopBriefing(); state.facilityDetail = ''; $('detail-overlay').hidden = true; if (state.focus && document.contains(state.focus)) state.focus.focus(); }
  function displaySchedules() {
    return state.schedules.map(function (schedule) {
      var receipt = paymentReceipts.filter(function (record) { return record.id === schedule.id; })[0];
      return P.receipt(schedule,receipt);
    });
  }
  function paymentInfo(id) { return config.payments && config.payments.instructions[id] || {}; }
  function paymentRequest(payload) {
    var endpoint = config.payments && config.payments.endpoint;
    var key = read(CACHE + '-payment-key');
    if (!endpoint || !key) return Promise.reject(new Error('먼저 가족 결제기록을 연결해줘.'));
    return new Promise(function (resolve,reject) {
      var controller = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () { if (controller) controller.abort(); reject(new Error('저장 응답을 확인하지 못했어. 새로고침해서 기록을 확인한 뒤 다시 시도해줘.')); },25000);
      fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({},payload,{key:key})),signal:controller ? controller.signal : undefined})
        .then(function (response) { if (!response.ok) throw new Error('결제기록 연결을 확인해줘.'); return response.json(); })
        .then(function (data) { if (!data.ok || !Array.isArray(data.receipts)) throw new Error(data.error || '기록을 확인하지 못했어.'); clearTimeout(timer); resolve(data); })
        .catch(function (error) { clearTimeout(timer); reject(error); });
    });
  }
  function syncPayments() {
    if (paymentBusy || !(config.payments && config.payments.endpoint) || !read(CACHE + '-payment-key')) return;
    paymentBusy = true;
    paymentRequest({action:'list'}).then(function (data) { paymentReceipts = data.receipts; $('payment-connect').textContent = '결제기록 연결됨'; renderAll(); })
      .catch(function () { $('payment-connect').textContent = '결제기록 연결 확인'; })
      .then(function () { paymentBusy = false; });
  }
  function openPaymentConnection() {
    openDialog('가족 결제기록 연결','모든 기기에서 같은 결제 기록 사용');
    detailLine('연결 안내','가족 연결 코드를 한 번 입력하면 이 기기에서도 결제 완료 기록을 함께 볼 수 있어.');
    if (!(config.payments && config.payments.endpoint)) { detailLine('설정 중','공유 저장소를 아직 활성화하지 않았어. 활성화 후 연결할 수 있어.'); return; }
    var label = el('label','payment-field','가족 연결 코드');
    var input = el('input'); input.type = 'password'; input.autocomplete = 'off'; input.required = true; label.appendChild(input); $('detail-content').appendChild(label);
    var feedback = el('p','payment-feedback'); feedback.setAttribute('role','status'); $('detail-content').appendChild(feedback);
    var button = el('button','text-button payment-confirm','연결하기');
    button.addEventListener('click',function () {
      if (!input.value.trim()) { feedback.textContent = '연결 코드를 입력해줘.'; input.focus(); return; }
      var previous = read(CACHE + '-payment-key'); store(CACHE + '-payment-key',input.value.trim()); button.disabled = true;
      paymentRequest({action:'list'}).then(function (data) { paymentReceipts = data.receipts; $('payment-connect').textContent = '결제기록 연결됨'; openDialog('결제기록을 연결했어','이 기기에서 사용할 준비 완료'); detailLine('공유 저장','결제일과 새 묶음 시작일이 가족 기기에 함께 반영돼.'); renderAll(); })
        .catch(function (error) { store(CACHE + '-payment-key',previous || ''); feedback.textContent = error.message; button.disabled = false; });
    }); $('detail-content').appendChild(button);
  }
  function openPayment(payment) {
    var info = paymentInfo(payment.id), title = info.label || payment.event.title.replace(/\s*\(\d+\/\d+\)\s*$/,'') + ' 결제';
    openDialog(title,'결제할 것');
    detailLine('결제 기한',S.dateLabel(payment.dueDate) + ' 수업 시작 전 · ' + payment.label);
    detailLine('결제 방법',info.detail || payment.event.memo || '방문할 때 결제 방법을 확인해줘.');
    if (info.amount) detailLine('선결제 금액',Number(info.amount).toLocaleString('ko-KR') + '원 · ' + payment.event.package.size + '회 · ' + info.method);
    detailLine('기록할 내용','오늘(' + S.dateLabel(today()) + ') 결제한 것으로 기록하고, 새 ' + payment.event.package.size + '회 묶음은 ' + S.dateLabel(payment.dueDate) + '부터 시작해. 실제 결제를 마친 뒤 눌러줘.');
    if (!(config.payments && config.payments.endpoint) || !read(CACHE + '-payment-key')) {
      var connect = el('button','text-button payment-confirm','결제기록 연결하기'); connect.addEventListener('click',openPaymentConnection); $('detail-content').appendChild(connect); return;
    }
    var amountLabel = el('label','payment-field','실제 결제 금액 (선택)');
    var amount = el('input'); amount.type = 'number'; amount.min = '0'; amount.max = '10000000'; amount.step = '1'; amount.value = info.amount || ''; amountLabel.appendChild(amount); $('detail-content').appendChild(amountLabel);
    var feedback = el('p','payment-feedback'); feedback.setAttribute('role','status'); $('detail-content').appendChild(feedback);
    var button = el('button','text-button payment-confirm','오늘 결제했어요');
    var requestId = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-payment';
    button.addEventListener('click',function () {
      if (!amount.checkValidity()) { amount.reportValidity(); return; }
      button.disabled = true; feedback.textContent = '가족 결제기록에 저장 중…';
      paymentRequest({action:'record',id:payment.id,packageStart:payment.dueDate,requestId:requestId,amount:amount.value,method:info.method || '미입력'})
        .then(function (data) { paymentReceipts = data.receipts; renderAll(); openDialog('결제 기록을 저장했어','가족 기기에 함께 반영'); detailLine('결제일',S.dateLabel(today())); detailLine('새 묶음 시작',S.dateLabel(payment.dueDate)); detailLine('안내','이번 결제 알림을 숨겼어. 다음 묶음 결제 7일 전부터 다시 알려줄게.'); })
        .catch(function (error) { feedback.textContent = error.message; button.disabled = false; });
    }); $('detail-content').appendChild(button);
  }
  function renderPayments() {
    if (!state.sheetOK && Date.now() - state.savedAt > 5 * 60000) { $('payment-section').hidden = true; return; }
    var payments = P.reminders(state.events,now());
    $('payment-section').hidden = !payments.length;
    var signature = JSON.stringify(payments.map(function (p) { return [p.id,p.dueDate,p.days]; }));
    if ($('payment-reminders').getAttribute('data-payments') === signature) return;
    clear($('payment-reminders'));
    payments.forEach(function (p) {
      var info = paymentInfo(p.id);
      var button = el('button','payment-reminder' + (p.urgent ? ' payment-urgent' : ''));
      button.setAttribute('aria-haspopup','dialog');
      button.appendChild(el('span','',info.label || p.event.title + ' 결제'));
      button.appendChild(el('strong','payment-dday',p.label));
      button.addEventListener('click',function () { openPayment(p); }); $('payment-reminders').appendChild(button);
    }); $('payment-reminders').setAttribute('data-payments',signature);
  }
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
    if (navigator.locks && navigator.locks.request) {
      navigator.locks.request(CACHE + '-alert-delivery',{ifAvailable:true},function (lock) { if (lock) deliverAlerts(); }).catch(deliverAlerts);
    } else deliverAlerts();
  }
  function deliverAlerts() {
    if (!state.loaded || !state.sheetOK || Date.now() - state.savedAt > 5 * 60000) return;
    notified = Object.assign({},notified,read(CACHE + '-alerts') || {});
    var candidates = S.dueAlerts(state.events,notified,now());
    if (!candidates.length) return;
    candidates.forEach(function (c) { notified[c.id] = today(); }); store(CACHE + '-alerts',notified);
    $('alert-title').textContent = candidates.map(function (c) { return c.event.title; }).join(' · ');
    $('alert-text').textContent = candidates.map(function (c) {
      if (c.kind !== 'departure') return '시작까지 ' + c.mins + '분 · ' + S.clockLabel(c.event.time);
      var leave = S.departure(c.event);
      return (c.stage === 0 ? '준비해서 나갈 시간' : '준비·출발까지 ' + c.mins + '분') + ' · ' + (leave.date !== today() ? S.dateLabel(leave.date) + ' ' : '') + S.clockLabel(leave.time) + ' · 일정 시작 ' + S.clockLabel(c.event.time);
    }).join(' / ');
    state.lastAlertText = candidates.map(S.alertSpeech).join(' ');
    $('alert').hidden = false; speak(state.lastAlertText);
    if (read(CACHE + '-desktop-notifications') && 'Notification' in window && Notification.permission === 'granted' && (document.hidden || !document.hasFocus())) {
      try {
        var notice = new Notification('지운아, 일정 확인해줘',{body:state.lastAlertText,tag:'home-dashboard-schedule'});
        notice.onclick = function () { window.focus(); activateSound(); openEvent(candidates[0].event); notice.close(); };
      } catch (error) { /* The in-page alert and voice remain available if system notifications fail. */ }
    }
  }
  function openBackgroundSetup() {
    openDialog('PC 알림 준비','다른 작업 중에도 일정 확인');
    detailLine('현재 음성',!window.speechSynthesis ? '이 브라우저에서는 음성 읽기를 지원하지 않아.' : !state.sound ? '꺼짐 · 아래에서 음성 테스트를 눌러 켤 수 있어.' : state.soundBlocked ? '브라우저가 재생을 막았어. 음성 테스트를 한 번 눌러줘.' : '켜짐 · 아래 버튼으로 실제 소리를 확인해줘.');
    detailLine('동작 조건','이 페이지와 브라우저를 열어두면 최소화하거나 다른 탭을 보는 동안에도 일정 확인과 음성을 시도해. 브라우저가 탭 실행을 중지하거나 PC가 절전·종료되면 보장할 수 없어.');
    detailLine('Chrome 설정','설정 → 성능 → 항상 활성 상태로 유지할 사이트에 willow-baek.github.io를 추가해줘. 탭도 고정해두면 좋아.');
    detailLine('처음 한 번','브라우저가 음성을 허용하도록 이 기기에서 음성 테스트를 눌러줘. 새로 연 페이지에서 다시 필요할 수 있어.');
    var voice = el('button','text-button payment-confirm','음성 테스트');
    voice.disabled = !window.speechSynthesis;
    voice.addEventListener('click',function () { state.sound = true; store(CACHE + '-sound',true); activateSound(); renderSoundButton(); speak('알림 테스트야. 다른 작업을 할 때도 일정 시간이 다가오면 알려줄게. 브라우저는 닫지 말아줘.'); });
    $('detail-content').appendChild(voice);
    var feedback = el('p','payment-feedback'); feedback.setAttribute('role','status'); $('detail-content').appendChild(feedback);
    var delayed = el('button','text-button payment-confirm','1분 뒤 백그라운드 테스트');
    delayed.disabled = !window.speechSynthesis || backgroundTestTimer !== null;
    delayed.addEventListener('click',function () {
      state.sound = true; store(CACHE + '-sound',true); activateSound(); renderSoundButton();
      delayed.disabled = true;
      feedback.textContent = '다른 창으로 전환하거나 브라우저를 최소화해줘. 약 1분 뒤 테스트 음성을 읽을게. 브라우저 실행 정책에 따라 늦어질 수 있어.';
      backgroundTestTimer = setTimeout(function () {
        backgroundTestTimer = null; delayed.disabled = false;
        speak('백그라운드 음성 테스트야. 다른 작업 중에도 이 소리가 들렸는지 확인해줘.');
        feedback.textContent = state.sound ? '테스트 음성을 요청했어. 실제 소리가 들렸는지 확인해줘.' : '음성이 꺼져 있어서 테스트를 읽지 않았어.';
      },60000);
    }); $('detail-content').appendChild(delayed);
    var notify = el('button','text-button payment-confirm','Windows 알림도 켜기');
    if (!('Notification' in window)) { notify.disabled = true; feedback.textContent = '이 브라우저는 시스템 알림을 지원하지 않아. 음성과 화면 안내를 사용해줘.'; }
    notify.addEventListener('click',function () {
      Notification.requestPermission().then(function (permission) {
        store(CACHE + '-desktop-notifications',permission === 'granted');
        feedback.textContent = permission === 'granted' ? '시스템 알림을 켰어. Windows 알림 설정과 방해 금지 모드도 확인해줘.' : '알림을 허용하지 않았어. 브라우저 사이트 설정에서 변경할 수 있어. 음성과 화면 안내는 계속 사용할 수 있어.';
      }).catch(function () { feedback.textContent = '브라우저 사이트 설정에서 알림 권한을 확인해줘.'; });
    }); $('detail-content').appendChild(notify);
    if ('Notification' in window) detailLine('시스템 알림',Notification.permission === 'granted' && read(CACHE + '-desktop-notifications') ? '켜짐' : Notification.permission === 'denied' ? '브라우저에서 차단됨' : '아직 켜지 않음');
    detailLine('중복 방지','같은 브라우저 프로필에서 대시보드를 여러 탭으로 열어도 이미 전달한 단계의 알림은 반복하지 않아. 다른 브라우저·프로필은 각각 확인이 필요해.');
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
      speak(due.length ? due.map(S.alertSpeech).join(' ') : '음성 알림을 켰어. 일정과 준비·이동시간에 맞춰 알려줄게.');
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
  ['gym','roof','library'].forEach(function (id) { $('facility-' + id).addEventListener('click',function () { openFacility(id); }); });
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
  $('today-briefing').addEventListener('click',openTodayBriefing);
  $('payment-connect').addEventListener('click',openPaymentConnection);
  $('background-setup').addEventListener('click',openBackgroundSetup);
  $('refresh').addEventListener('click',function () { loadSheet(); loadWeather(); });
  $('sound-toggle').addEventListener('click',function () {
      if (state.sound && state.soundBlocked) { activateSound(); return; }
      state.sound = !state.sound;
      store(CACHE + '-sound',state.sound);
      if (state.sound) {
        activateSound();
        var due = state.sheetOK && Date.now() - state.savedAt <= 5 * 60000 ? S.dueAlerts(state.events,{},now()) : [];
        speak(!$('alert').hidden && due.length ? due.map(S.alertSpeech).join(' ') : '음성 알림을 켰어. 일정과 준비·이동시간에 맞춰 알려줄게.');
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
  renderAll(); icons(); loadSheet(); loadWeather(); syncPayments();
  setInterval(function () { renderAll(); updateSync(false); },30000);
  setInterval(checkAlerts,10000);
  setInterval(updateBriefing,1000);
  setInterval(loadSheet,60000); setInterval(loadWeather,600000);
  setInterval(syncPayments,60000);
  function recoverPage() { renderAll(); loadSheet(); loadWeather(); syncPayments(); checkAlerts(); }
  document.addEventListener('visibilitychange',function () { document.documentElement.classList.toggle('page-hidden',document.hidden); if (!document.hidden) recoverPage(); });
  window.addEventListener('pageshow',recoverPage);
  window.addEventListener('online',recoverPage);
  window.addEventListener('storage',function (event) { if (event.key === CACHE + '-alerts') notified = Object.assign({},notified,read(CACHE + '-alerts') || {}); });
  window.addEventListener('resize',function () { fitHeader(); fitMessage(); });
  if (window.ResizeObserver) new ResizeObserver(fitMessage).observe(document.querySelector('.message-copy'));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fitHeader(); fitMessage(); });
}());
