(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./schedule.js'));
  else root.DashboardBriefing = factory(root.Schedule);
}(typeof self !== 'undefined' ? self : this, function (S) {
  'use strict';
  function duration(minutes) {
    var value = Math.max(0, Math.ceil(minutes)), hours = Math.floor(value / 60), rest = value % 60;
    return (hours ? hours + '시간' : '') + (hours && rest ? ' ' : '') + (rest || !hours ? rest + '분' : '');
  }
  function spokenClock(time) {
    if (!S.time(time)) return '시간 확인 필요';
    var hour = +time.slice(0,2), minute = +time.slice(3);
    return (hour < 12 ? '오전 ' : '오후 ') + (hour % 12 || 12) + '시' + (minute ? ' ' + minute + '분' : '');
  }
  function title(text) { return text.replace(/[\uD800-\uDFFF\u2600-\u27BF\uFE0F\u200D]/g,'').replace(/\s+/g,' ').trim(); }
  function status(event, now) {
    if (S.isOngoing(event,now)) return '진행 중 · ' + S.dateLabel(event.endDate) + '까지';
    if (!event.time) return event.endDate ? '시간 지정 없음' : '시간 확인 필요';
    var diff = S.minutesUntil(event.date,event.time,now);
    return diff > 0 ? '시작까지 ' + duration(diff) : diff === 0 ? '지금 시작 시각' : '예정 시각이 지났어요';
  }
  function build(events, now, selectedUid) {
    var day = S.seoulKey(now);
    var items = events.filter(function (e) { return !e.cancelled && S.coversDay(e,day); })
      .slice().sort(function (a,b) { return (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99')); });
    var next = items.filter(function (e) { return e.time && S.minutesUntil(e.date,e.time,now) > 0; })[0];
    var selected = items.filter(function (e) { return e.uid === selectedUid; })[0];
    var focus = selected || next;
    var headline = focus ? focus.title + ' · ' + status(focus,now) : items.length ? '오늘 남은 확정 시작 일정은 없어요.' : '오늘은 등록된 일정이 없어.';
    var lines = ['오늘은 ' + S.dateLabel(day) + '이야.'];
    if (!items.length) lines.push('오늘은 등록된 일정이 없어.');
    else {
      lines.push('오늘 일정은 ' + items.length + '개야.');
      items.forEach(function (e) {
        if (S.isOngoing(e,now)) lines.push(title(e.title) + ' 일정이 진행 중이고, ' + S.dateLabel(e.endDate) + '까지야.');
        else lines.push((e.time ? spokenClock(e.time) + '에 ' : '시간을 확인해야 하는 ') + title(e.title) + ' 일정이 있어.' + (e.time && S.minutesUntil(e.date,e.time,now) < 0 ? ' 예정 시각은 지났어.' : ''));
      });
      if (focus) {
        var diff = focus.time ? S.minutesUntil(focus.date,focus.time,now) : null;
        if (diff > 0) {
          lines.push(title(focus.title) + ' 시작까지 ' + duration(diff) + ' 남았어.');
          if (focus.travel) {
            var leave = S.departure(focus), left = diff - focus.travel;
            lines.push(spokenClock(leave.time) + '에 준비해서 출발해야 해. ' + (left > 0 ? '출발까지 ' + duration(left) + ' 남았어.' : '지금 준비해서 출발할 시간이야.'));
          }
        }
      }
      if (!next) lines.push('오늘 남은 확정 시작 일정은 없어.');
    }
    return { items:items, next:next, focus:focus, headline:headline, speech:lines.join(' ') };
  }
  function countdown(settings, defaults, now) {
    settings = settings || {}; defaults = defaults || {};
    var target = S.date(settings.return_date || defaults.date);
    var start = S.date(settings.return_start || defaults.start);
    var day = S.seoulKey(now);
    if (!target || start && day < start) return null;
    var days = Math.round((new Date(target + 'T00:00:00Z') - new Date(day + 'T00:00:00Z')) / 86400000);
    return { days:days, label:days > 0 ? '누나 컴백 D-' + days : days === 0 ? '누나 컴백 D-DAY' : '누나 컴백 D+' + Math.abs(days),
      message:S.text(settings.return_message || defaults.message), date:target };
  }
  return { build:build, status:status, duration:duration, countdown:countdown };
}));
