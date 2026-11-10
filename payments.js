(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./schedule.js'));
  else root.DashboardPayments = factory(root.Schedule);
}(typeof self !== 'undefined' ? self : this, function (S) {
  'use strict';
  function reminders(events, now) {
    var today = S.seoulKey(now), byId = {};
    events.forEach(function (e) {
      if (e.cancelled || !e.package) return;
      var due = e.package.paid ? e.package.nextDate : e.package.startDate;
      if (!due) return;
      var days = Math.round((new Date(due + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000);
      if (days > 7 || byId[e.id] && byId[e.id].dueDate <= due) return;
      byId[e.id] = { id:e.id, dueDate:due, days:days, urgent:days <= 3, event:e,
        label:days > 0 ? 'D-' + days : days === 0 ? 'D-DAY' : '기한 ' + Math.abs(days) + '일 지남' };
    });
    return Object.keys(byId).map(function (id) { return byId[id]; }).sort(function (a,b) { return a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id); });
  }
  function receipt(schedule, record) {
    if (!record || record.id !== schedule.id || !S.date(record.packageStart) || !S.date(record.paidOn)) return schedule;
    if (schedule.packageStart && record.packageStart < schedule.packageStart) return schedule;
    return Object.assign({},schedule,{packageStart:record.packageStart,paidOn:record.paidOn});
  }
  return {reminders:reminders,receipt:receipt};
}));
