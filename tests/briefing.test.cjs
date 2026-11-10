const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../briefing.js');
const S = require('../schedule.js');
const at = value => new Date(value + '+09:00');
const event = (id,time,extra={}) => ({uid:id,id,date:'2026-11-11',title:id,time,...extra});

test('briefing reads every today event in order, including past recurring events, but excludes cancellations', () => {
  const model = B.build([event('오후 수업','14:00'),event('취소','13:00',{cancelled:true}),event('아침 수업','09:00',{weeks:1}),event('시간 미정',''),event('내일 일정','15:00',{date:'2026-11-12'})],at('2026-11-11T10:30:00'));
  assert.deepEqual(model.items.map(e=>e.uid),['아침 수업','오후 수업','시간 미정']);
  assert.match(model.speech,/오늘 일정은 3개/);
  assert.match(model.speech,/예정 시각은 지났어/);
  assert.match(model.speech,/오후 수업 시작까지 3시간 30분 남았어/);
  assert.doesNotMatch(model.speech,/취소|내일 일정/);
});
test('selected event countdown includes travel and never reports attendance as complete', () => {
  const model = B.build([event('상담','11:00',{travel:40}),event('수업','14:00')],at('2026-11-11T10:30:00'),'수업');
  assert.equal(model.focus.uid,'수업');
  const leaving = B.build([event('상담','11:00',{travel:40})],at('2026-11-11T10:30:00'));
  assert.match(leaving.speech,/지금 준비해서 출발할 시간/);
  assert.doesNotMatch(leaving.speech,/완료/);
});
test('no schedules, unknown time, exact start and ongoing periods have truthful statuses', () => {
  assert.match(B.build([],at('2026-11-11T12:00:00')).speech,/등록된 일정이 없어/);
  assert.equal(B.status(event('미정',''),at('2026-11-11T12:00:00')),'시간 확인 필요');
  assert.equal(B.status(event('시작','12:00'),at('2026-11-11T12:00:00')),'지금 시작 시각');
  const ongoing = event('여행','',{date:'2026-11-10',endDate:'2026-11-12'});
  assert.match(B.build([ongoing],at('2026-11-11T12:00:00')).speech,/진행 중/);
});
test('return countdown uses Seoul midnight, starts on departure, and supports sheet message overrides', () => {
  const defaults = {date:'2027-11-12',start:'2026-11-11',message:'집사야 집 관리 잘해라!'};
  assert.equal(B.countdown({},defaults,at('2026-11-10T23:59:59')),null);
  assert.equal(B.countdown({},defaults,at('2026-11-11T00:00:00')).days,366);
  assert.equal(B.countdown({},defaults,at('2026-11-12T00:00:00')).label,'누나 컴백 D-365');
  assert.equal(B.countdown({},defaults,new Date('2026-11-11T15:00:00Z')).days,365);
  assert.equal(B.countdown({},defaults,at('2027-11-12T00:00:00')).label,'누나 컴백 D-DAY');
  assert.equal(B.countdown({},defaults,at('2027-11-13T00:00:00')).label,'누나 컴백 D+1');
  assert.equal(B.countdown({return_message:'새 멘트'},defaults,at('2026-11-12T00:00:00')).message,'새 멘트');
  assert.equal(B.countdown({return_date:'잘못된 날짜'},defaults,at('2026-11-12T00:00:00')),null);
});
test('weekly Kona schedule includes consecutive Wednesdays', () => {
  const schedule = S.normalize({id:'kona',date:'2026-10-21',time:'11:00',title:'코나 심리상담센터',repeat:'1주마다'});
  assert.deepEqual(S.expand([schedule],[],'2026-11-09','2026-11-22').map(e=>e.date),['2026-11-11','2026-11-18']);
});
