(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./vendor/rrule.js'));
  else root.Schedule = factory(root.rrule);
}(typeof self !== 'undefined' ? self : this, function (recurrence) {
  'use strict';
  var DAY = 86400000;
  function pad(n) { return String(n).padStart(2, '0'); }
  function text(value) { return value == null ? '' : String(value).trim(); }
  function dateKey(date) { return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate()); }
  function seoulKey(now) { return dateKey(new Date(now.getTime() + 9 * 3600000)); }
  function date(value) {
    var match = text(value).match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (!match) return '';
    var normalized = match[1] + '-' + pad(+match[2]) + '-' + pad(+match[3]);
    var parsed = new Date(normalized + 'T00:00:00Z');
    return !isNaN(parsed.getTime()) && dateKey(parsed) === normalized ? normalized : '';
  }
  function time(value) {
    var match = text(value).match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    return match && +match[1] < 24 && +match[2] < 60 ? pad(+match[1]) + ':' + match[2] : '';
  }
  function addDays(key, amount) { return dateKey(new Date(new Date(key + 'T00:00:00Z').getTime() + amount * DAY)); }
  function weekday(key) { return new Date(key + 'T00:00:00Z').getUTCDay(); }
  function weekStart(key) { return addDays(key, -((weekday(key) + 6) % 7)); }
  function minutesUntil(key, clock, now) { return clock ? (new Date(key + 'T' + clock + ':00+09:00') - now) / 60000 : null; }
  function clockLabel(value) {
    var valid = time(value);
    if (!valid) return '시간 확인 필요';
    var h = +valid.slice(0, 2);
    return (h < 12 ? '오전 ' : '오후 ') + (h % 12 || 12) + ':' + valid.slice(3);
  }
  function dateLabel(key) { return +key.slice(5, 7) + '월 ' + +key.slice(8, 10) + '일 (' + ['일','월','화','수','목','금','토'][weekday(key)] + ')'; }
  function field(row, names) {
    for (var i = 0; i < names.length; i++) if (row[names[i]] != null) return text(row[names[i]]);
    return '';
  }
  function dictionary(rows) {
    var result = {};
    rows.forEach(function (row) { if (text(row.key)) result[text(row.key)] = text(row.value); });
    return result;
  }
  function interval(value) {
    var s = text(value);
    if (!s || /^(없음|1회|단발|none)$/i.test(s)) return 0;
    if (s === '매주') return 1;
    if (s === '격주') return 2;
    var m = s.match(/^(\d+)\s*(?:주(?:마다)?|weeks?)?$/i);
    return m && +m[1] > 0 && +m[1] <= 52 ? +m[1] : -1;
  }
  function normalize(row, index) {
    var weeks = interval(field(row, ['repeat','반복','반복주']));
    var anchor = date(field(row, ['date','기준 날짜','기준날짜','날짜']));
    var mode = field(row, ['time_mode','시간 방식','시간방식']);
    var active = field(row, ['active','사용']);
    var title = field(row, ['title','일정','일정명']);
    var paused = field(row, ['중단']);
    var alerts = field(row, ['alerts','알림','알람']);
    var periodValue = field(row, ['period_end','기간종료일','끝나는날짜']);
    var periodEnd = date(periodValue);
    return {
      id: field(row, ['id','ID','일정ID']) || 'auto:' + title,
      title: title, date: anchor,
      time: time(field(row, ['time','기본 시간','기본시간','시간'])), weeks: weeks,
      variable: /매회|확인|variable/i.test(mode),
      alerts: alerts ? !/^(false|0|아니오|off)$/i.test(alerts) : !/아카데미|academy|방문|오는\s*날/i.test(title),
      packageSize: Math.min(100, Math.max(0, parseInt(field(row, ['package_size','묶음횟수']),10) || 0)),
      packageStart: date(field(row, ['package_start','결제묶음시작일'])),
      paidOn: date(field(row, ['paid_on','결제일'])),
      memo: field(row, ['memo','메모']), contact: field(row, ['contact','연락처']),
      travel: Math.min(360, Math.max(0, parseInt(field(row, ['travel_minutes','이동시간','준비·이동시간']), 10) || 0)),
      end: date(field(row, ['end_date','반복종료일','종료일'])), periodEnd:periodEnd,
      active: !/^(true|1|중단)$/i.test(paused) && !/^(false|0|중단|아니오|off)$/i.test(active),
      issue: weeks < 0 ? '반복 규칙 확인 필요' : !anchor ? '예약 날짜 확인 필요' : periodValue && (!periodEnd || periodEnd < anchor) ? '기간 종료일 확인 필요' : periodEnd && weeks ? '기간 일정은 반복을 비워주세요' : ''
    };
  }
  function legacyRows(data) {
    var indices = {};
    Object.keys(data).forEach(function (key) { var m = key.match(/^event(\d+)_/); if (m) indices[m[1]] = true; });
    return Object.keys(indices).sort(function (a,b) { return +a - +b; }).map(function (index) {
      var row = { id: 'event' + index };
      ['date','time','title','repeat','memo','contact','time_mode','travel_minutes','end_date','period_end','active','alerts'].forEach(function (key) { row[key] = data['event' + index + '_' + key] || ''; });
      return row;
    });
  }
  function legacyExceptions(data) {
    var indices = {};
    Object.keys(data).forEach(function (key) { var m = key.match(/^exception(\d+)_/); if (m) indices[m[1]] = true; });
    return Object.keys(indices).map(function (index) {
      var row = {};
      ['event_id','original_date','action','date','time','memo'].forEach(function (key) { row[key] = data['exception' + index + '_' + key] || ''; });
      return row;
    });
  }
  function normalizeExceptions(rows, schedules) {
    return rows.filter(function (row) { return Object.keys(row).some(function (key) { return !!text(row[key]); }); }).map(function (row) {
      var original = field(row, ['original_date','원래 날짜','원래날짜']);
      var moved = field(row, ['date','변경 날짜','변경날짜']);
      var clock = field(row, ['time','변경 시간','변경시간']);
      var result = { id: field(row, ['event_id','일정ID']), original: date(original),
        action: field(row, ['action','처리']), date: date(moved),
        time: time(clock), memo: field(row, ['memo','메모']) };
      var title = field(row, ['일정','일정명']);
      if (!result.id && title && schedules) {
        var matches = schedules.filter(function (s) { return s.title === title; });
        if (matches.length === 1) result.id = matches[0].id;
      }
      result.issue = !result.id || !result.original || moved && !result.date || clock && !result.time || !/^(취소|cancel|변경|change|시간 확정|confirm)$/i.test(result.action) || /^(시간 확정|confirm)$/i.test(result.action) && !result.time ? '변경사항 입력 확인 필요' : '';
      return result;
    });
  }
  function expandRaw(schedules, exceptions, start, end) {
    var lookup = {};
    exceptions.forEach(function (e) { if (e.id && e.original) lookup[e.id + '/' + e.original] = e; });
    var results = [];
    schedules.filter(function (s) { return s.active && s.title && s.date && s.weeks >= 0 && !s.issue; }).forEach(function (s) {
      var dates = [];
      if (s.weeks) {
        // RRule uses floating UTC dates; the actual appointment time is applied in Seoul below.
        var rule = new recurrence.RRule({ freq: recurrence.RRule.WEEKLY, interval: s.weeks,
          dtstart: new Date(s.date + 'T00:00:00Z'), until: s.end ? new Date(s.end + 'T00:00:00Z') : undefined });
        dates = rule.between(new Date(start + 'T00:00:00Z'), new Date(end + 'T00:00:00Z'), true).map(dateKey);
        exceptions.filter(function (e) { return e.id === s.id && e.date && e.date >= start && e.date <= end; }).forEach(function (e) {
          if (dates.indexOf(e.original) === -1 && rule.between(new Date(e.original + 'T00:00:00Z'), new Date(e.original + 'T00:00:00Z'), true).length) dates.push(e.original);
        });
      } else dates = [s.date];
      dates.forEach(function (original) {
        var override = lookup[s.id + '/' + original];
        var cancelled = override && /^(取消|취소|cancel)$/i.test(override.action);
        var actual = override && override.date || original;
        var clock = s.variable && original !== s.date ? '' : s.time;
        if (override && override.time) clock = override.time;
        var endDate = s.periodEnd ? addDays(actual,Math.round((new Date(s.periodEnd + 'T00:00:00Z') - new Date(s.date + 'T00:00:00Z')) / DAY)) : '';
        if ((endDate || actual) < start || actual > end) return;
        results.push({ uid: s.id + '/' + original, id: s.id, original: original, date: actual, endDate:endDate, time: clock,
          title: s.title, weeks: s.weeks, memo: override && override.memo || s.memo, contact: s.contact,
          travel: s.travel, alerts:s.alerts, cancelled: !!cancelled, changed: !!override && !cancelled, needsTime: !clock && !endDate });
      });
    });
    return results.sort(function (a,b) { return (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99')); });
  }
  function expand(schedules, exceptions, start, end) {
    var results = expandRaw(schedules, exceptions, start, end);
    schedules.filter(function (s) { return s.packageSize && s.packageStart && s.weeks > 0; }).forEach(function (s) {
      // Count scheduled, non-cancelled lessons from the paid package's first lesson,
      // including history outside the displayed week and actual rescheduled dates.
      var historySchedule = Object.assign({},s,{date: s.date < s.packageStart ? s.date : s.packageStart});
      var historyStart = s.packageStart;
      exceptions.forEach(function (e) { if (e.id === s.id && e.original >= s.packageStart && e.date && e.date < historyStart) historyStart = e.date; });
      var history = expandRaw([historySchedule],exceptions,historyStart,addDays(end,s.weeks * 7 * (s.packageSize + 1)))
        .filter(function (e) { return !e.cancelled && e.original >= s.packageStart; });
      var counts = {};
      history.forEach(function (e,i) {
        var cycle = Math.floor(i / s.packageSize), lesson = i % s.packageSize + 1;
        counts[e.uid] = { lesson:lesson, size:s.packageSize, paid:cycle === 0 && !!s.paidOn,
          paidOn:cycle === 0 ? s.paidOn : '', nextDate:history[(cycle + 1) * s.packageSize] ? history[(cycle + 1) * s.packageSize].date : '' };
      });
      results.forEach(function (e) {
        if (e.id !== s.id || !counts[e.uid]) return;
        e.package = counts[e.uid];
        e.title = e.title.replace(/\s*\(\d+\s*\/\s*\d+\)\s*$/,'').trim() + ' (' + e.package.lesson + '/' + e.package.size + ')';
      });
    });
    return results;
  }
  function coversDay(event, day) { return event.date <= day && (event.endDate || event.date) >= day; }
  function isOngoing(event, now) {
    return !!event.endDate && !event.cancelled && coversDay(event,seoulKey(now)) && (!event.time || minutesUntil(event.date,event.time,now) <= 0);
  }
  function agenda(events, now) {
    var today = seoulKey(now), seen = {};
    return events.slice().sort(function (a,b) { return (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99')); }).filter(function (e) {
      if (e.cancelled || (e.endDate || e.date) < today) return false;
      if (!e.weeks) return true;
      if (e.time && minutesUntil(e.date,e.time,now) <= 0 || seen[e.id]) return false;
      seen[e.id] = true;
      return true;
    });
  }
  function dueAlerts(events, notified, now) {
    var result = [], thresholds = [5,10,15,30,60];
    events.forEach(function (e) {
      if (e.cancelled || !e.time || e.alerts === false) return;
      var minutes = minutesUntil(e.date,e.time,now);
      if (minutes <= 0 || minutes > 60) return;
      // A late-opening tab announces only its current interval, not all missed alerts.
      var stage = thresholds.filter(function (n) { return minutes <= n; })[0];
      var key = e.uid + '/' + e.date + '/' + e.time + '/' + stage + '-start';
      if (!Object.prototype.hasOwnProperty.call(notified,key)) result.push({event:e,id:key,stage:stage,mins:Math.ceil(minutes)});
    });
    return result.sort(function (a,b) { return a.mins - b.mins; });
  }
  function alertSpeech(candidate) {
    var title = candidate.event.title.replace(/[\uD800-\uDFFF\u2600-\u27BF\uFE0F\u200D]/g,'').replace(/\s+/g,' ').trim();
    var clock = time(candidate.event.time), hour = +clock.slice(0,2), minute = +clock.slice(3);
    var spokenTime = (hour < 12 ? '오전 ' : '오후 ') + (hour % 12 || 12) + '시' + (minute ? ' ' + minute + '분' : '');
    return candidate.mins + '분 뒤, ' + spokenTime + '에 ' + title + ' 일정이 있어. 준비해줘.';
  }
  function weatherComment(data, now, departures) {
    if (!data || !data.current || !data.hourly || !data.hourly.time) return '';
    var nowKey = seoulKey(now);
    var current = data.current.apparent_temperature;
    var windows = [];
    data.hourly.time.forEach(function (stamp, i) {
      var delta = (new Date(stamp + ':00+09:00') - now) / 3600000;
      if (delta >= -1 && delta <= 8 && stamp.slice(0,10) === nowKey) windows.push(i);
    });
    var tripWindows = windows.filter(function (i) {
      return departures.some(function (departure) { return Math.abs(new Date(data.hourly.time[i] + ':00+09:00') - departure) <= 2 * 3600000; });
    });
    var selected = tripWindows.length ? tripWindows : windows;
    if (typeof current !== 'number' || !isFinite(current)) return '';
    var probabilities = selected.map(function (i) { return (data.hourly.precipitation_probability || [])[i]; }).filter(function (n) { return typeof n === 'number'; });
    var feels = selected.map(function (i) { return (data.hourly.apparent_temperature || [])[i]; }).filter(function (n) { return typeof n === 'number'; });
    var wind = selected.map(function (i) { return (data.hourly.wind_speed_10m || [])[i]; }).filter(function (n) { return typeof n === 'number'; });
    var maxP = probabilities.length ? Math.max.apply(null, probabilities) : null;
    var minFeel = feels.length ? Math.min.apply(null, feels) : current;
    var maxWind = wind.length ? Math.max.apply(null, wind) : 0;
    var rainNow = [51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99].indexOf(data.current.weather_code) >= 0;
    var lines = [];
    if (rainNow) lines.push('지금 비나 눈이 내려. 나갈 때 우산 챙겨가.');
    else if (maxP !== null && maxP >= 50) lines.push(tripWindows.length ? '외출할 때 비 올 수 있어. 우산 챙겨가.' : '앞으로 비 올 수 있어. 우산 챙겨가.');
    else if (maxP !== null && maxP >= 30) lines.push('비가 올 수도 있으니 작은 우산 챙겨두면 좋겠어.');
    if (minFeel <= 3) lines.push('밖에 많이 추워. 따뜻한 겉옷 입고 가.');
    else if (minFeel <= 12) lines.push('밖에 쌀쌀해. 겉옷 하나 챙겨가.');
    else if (current >= 28) lines.push('밖에 많이 더워. 물 챙기고 쉬어가.');
    else if (minFeel <= 20) lines.push('밖이 선선해. 얇은 겉옷 하나 챙겨가.');
    else if (current >= 24) lines.push('밖이 조금 더울 수 있어. 가벼운 옷차림으로 나가고 물도 챙겨가.');
    else lines.push('밖은 비교적 온화해. 편한 옷차림으로 나가도 괜찮겠어.');
    if (maxWind >= 30 && lines.length < 2) lines.push('바람이 세게 불 수 있어. 나갈 때 조심해.');
    return lines.slice(0,2).join(' ');
  }
  return { text: text, date: date, time: time, dateKey: dateKey, seoulKey: seoulKey, addDays: addDays, weekday: weekday,
    weekStart: weekStart, minutesUntil: minutesUntil, clockLabel: clockLabel, dateLabel: dateLabel,
    dictionary: dictionary, normalize: normalize, legacyRows: legacyRows, legacyExceptions: legacyExceptions,
    normalizeExceptions: normalizeExceptions, expand: expand, coversDay:coversDay, isOngoing:isOngoing, agenda: agenda, dueAlerts: dueAlerts, alertSpeech: alertSpeech, weatherComment: weatherComment };
}));
