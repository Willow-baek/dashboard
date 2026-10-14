const test=require('node:test');
const assert=require('node:assert/strict');
const S=require('../schedule.js');
const at=(date,time)=>new Date(date+'T'+time+':00+09:00');
const event=(row={})=>S.expand([S.normalize({id:'a',일정:'상담',날짜:'2026-10-15',시간:'14:00','준비·이동시간':'40',알림:'TRUE',...row})],[],'2026-10-14','2026-10-18')[0];
test('travel shifts all stages and adds a one-off preparation/departure-time cue',()=>{
  const e=event(),notified={},target=at('2026-10-15','13:20');
  assert.equal(S.dueAlerts([e],{},new Date(+target-60*60000-1000)).length,0);
  for(const stage of [60,30,15,10,5,0]) {
    const now=new Date(+target-stage*60000),due=S.dueAlerts([e],notified,now);
    assert.equal(due.length,1);assert.equal(due[0].kind,'departure');assert.equal(due[0].stage,stage);
    assert.equal(due[0].mins,stage);notified[due[0].id]='2026-10-15';
    assert.equal(S.dueAlerts([e],notified,new Date(+now+1000)).length,0);
  }
  assert.equal(S.dueAlerts([e],{},at('2026-10-15','13:26')).length,0);
  assert.equal(S.dueAlerts([e],{},at('2026-10-15','14:00')).length,0);
});
test('speech distinguishes departure countdown from the appointment time',()=>{
  const e=event();
  const before=S.dueAlerts([e],{},at('2026-10-15','13:10'))[0];
  assert.equal(S.alertSpeech(before),'출발까지 10분 남았어. 상담 일정은 오후 2시에 시작해.');
  const now=S.dueAlerts([e],{},at('2026-10-15','13:20'))[0];
  assert.match(S.alertSpeech(now),/이제 준비해서 나갈 시간이야/);
});
test('a late tab gets one current cue, with a bounded five-minute departure catch-up',()=>{
  const e=event();
  const late=S.dueAlerts([e],{},at('2026-10-15','13:08'));
  assert.equal(late.length,1);assert.equal(late[0].stage,15);assert.equal(late[0].mins,12);
  assert.equal(S.dueAlerts([e],{},at('2026-10-15','13:24'))[0].stage,0);
  assert.equal(S.dueAlerts([e],{},at('2026-10-15','13:26')).length,0);
});
test('departure dates can fall on the previous Seoul day',()=>{
  const e=event({시간:'00:20'});
  assert.deepEqual(S.departure(e),{date:'2026-10-14',time:'23:40'});
  assert.equal(S.dueAlerts([e],{},at('2026-10-14','22:40'))[0].stage,60);
});
test('changed lead times have distinct keys; disabled/cancelled/untimed events remain silent',()=>{
  const e=event(),now=at('2026-10-15','12:50'),first=S.dueAlerts([e],{},now)[0];
  assert.equal(S.dueAlerts([{...e,travel:50}],{[first.id]:'2026-10-15'},now).length,1);
  assert.equal(S.dueAlerts([{...e,alerts:false},{...e,cancelled:true},{...e,time:''}],{},now).length,0);
  const period=event({기간종료일:'2026-10-18'});
  assert.equal(S.dueAlerts([period],{},at('2026-10-16','13:20')).length,0);
});
test('period labels include weekdays and omit only a redundant month',()=>{
  assert.equal(S.periodLabel('2026-10-23','2026-10-25'),'10/23(금)-25(일)');
  assert.equal(S.periodLabel('2026-10-30','2026-11-02'),'10/30(금)-11/2(월)');
  assert.equal(S.periodLabel('2026-12-30','2027-01-02'),'2026/12/30(수)-2027/1/2(토)');
  assert.equal(S.periodLabel('2026-10-23','2026-10-23'),'10/23(금)');
});
