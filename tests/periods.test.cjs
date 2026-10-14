const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../schedule.js');
const trip = (values={}) => S.normalize({id:'trip',일정:'부산 여행',날짜:'2026-10-23',기간종료일:'2026-10-25',시간:'14:00',반복:'없음',알림:'TRUE',...values});
const at = (date,time='12:00') => new Date(date+'T'+time+':00+09:00');
test('a period stays as one agenda entry through its inclusive end date', () => {
  const events=S.expand([trip()],[],'2026-10-19','2026-11-01');
  assert.equal(events.length,1);
  for(const day of ['2026-10-23','2026-10-24','2026-10-25']) {
    assert.equal(S.coversDay(events[0],day),true);
    assert.equal(S.agenda(events,at(day)).length,1);
  }
  assert.equal(S.agenda(events,at('2026-10-26')).length,0);
  assert.equal(S.isOngoing(events[0],at('2026-10-23','13:59')),false);
  assert.equal(S.isOngoing(events[0],at('2026-10-23','14:00')),true);
  assert.equal(S.isOngoing(events[0],at('2026-10-25','23:59')),true);
});
test('a period beginning before a calendar window still appears on overlapping days', () => {
  const events=S.expand([trip({날짜:'2026-10-01',기간종료일:'2026-11-05'})],[],'2026-10-26','2026-11-01');
  assert.equal(events.length,1);
  assert.equal(events[0].date,'2026-10-01');
  assert.equal(S.coversDay(events[0],'2026-11-01'),true);
  assert.equal(S.expand([trip()],[],'2026-10-26','2026-11-01').length,0);
});
test('period reminders occur only before the original start time, never daily', () => {
  const events=S.expand([trip()],[],'2026-10-19','2026-11-01');
  assert.equal(S.dueAlerts(events,{},at('2026-10-23','13:00')).length,1);
  assert.equal(S.dueAlerts(events,{},at('2026-10-24','13:00')).length,0);
  const untimed=S.expand([trip({시간:''})],[],'2026-10-19','2026-11-01');
  assert.equal(untimed[0].needsTime,false);
  assert.equal(S.isOngoing(untimed[0],at('2026-10-23','00:00')),true);
  assert.equal(S.dueAlerts(untimed,{},at('2026-10-23','13:00')).length,0);
});
test('cancellation suppresses the whole period; moving keeps its duration', () => {
  const move=S.normalizeExceptions([{event_id:'trip',original_date:'2026-10-23',action:'변경',date:'2026-10-30'}]);
  const moved=S.expand([trip()],move,'2026-10-30','2026-11-02');
  assert.equal(moved[0].endDate,'2026-11-01');
  const cancel=S.normalizeExceptions([{event_id:'trip',original_date:'2026-10-23',action:'취소'}]);
  const cancelled=S.expand([trip()],cancel,'2026-10-23','2026-10-25');
  assert.equal(S.agenda(cancelled,at('2026-10-24')).length,0);
});
test('period and repeating end dates are distinct; invalid periods require confirmation', () => {
  const repeat=trip({기간종료일:'',반복:'1주마다',반복종료일:'2026-10-30'});
  assert.equal(S.expand([repeat],[],'2026-10-23','2026-11-30').length,2);
  for(const values of [{기간종료일:'2026-10-22'},{기간종료일:'bad'},{반복:'1주마다'}]) {
    const invalid=trip(values); assert.ok(invalid.issue);
    assert.equal(S.expand([invalid],[],'2026-10-19','2026-11-30').length,0);
  }
  const oneDay=S.expand([trip({기간종료일:'2026-10-23'})],[],'2026-10-23','2026-10-23');
  assert.equal(oneDay.length,1);
});
test('cross-year periods use Korean midnight boundaries', () => {
  const events=S.expand([trip({날짜:'2026-12-30',기간종료일:'2027-01-02',시간:''})],[],'2027-01-01','2027-01-07');
  assert.equal(S.agenda(events,new Date('2027-01-02T14:59:59Z')).length,1);
  assert.equal(S.agenda(events,new Date('2027-01-02T15:00:00Z')).length,0);
});
