const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../schedule.js');
const make = (fields) => S.normalize({ id: 'a', title: '상담', date: '2026-10-07', time: '11:00', repeat: '2주마다', ...fields });

test('Korean dates stay correct before 09:00 and times accept a single hour digit', () => {
  assert.equal(S.seoulKey(new Date('2026-10-12T16:00:00Z')), '2026-10-13');
  assert.equal(S.time('9:30'), '09:30');
  assert.equal(S.clockLabel('9:30'), '오전 9:30');
  assert.equal(S.date('2026-02-30'), '');
  assert.equal(S.time('25:00'), '');
});
test('weekly and fortnightly recurrence continues after the anchor date', () => {
  const events = S.expand([make({})], [], '2026-10-12', '2026-11-30');
  assert.deepEqual(events.map(e => e.date), ['2026-10-21','2026-11-04','2026-11-18']);
  assert.deepEqual(S.expand([make({ repeat: '1주마다' })], [], '2026-10-12', '2026-10-25').map(e => e.date), ['2026-10-14','2026-10-21']);
});
test('one cancellation and one move leave subsequent recurrence unchanged', () => {
  const overrides = S.normalizeExceptions([
    { event_id: 'a', original_date: '2026-10-21', action: '취소' },
    { event_id: 'a', original_date: '2026-11-04', action: '변경', date: '2026-11-05', time: '9:30' }
  ]);
  const events = S.expand([make({})], overrides, '2026-10-12', '2026-11-30');
  assert.equal(events[0].cancelled, true);
  assert.equal(events[1].date, '2026-11-05');
  assert.equal(events[1].time, '09:30');
  assert.equal(events[2].date, '2026-11-18');
});
test('a rescheduled occurrence moved into a different calendar range is included', () => {
  const overrides = S.normalizeExceptions([{ event_id:'a', original_date:'2026-10-21', action:'변경', date:'2026-11-01' }]);
  assert.equal(S.expand([make({})],overrides,'2026-11-01','2026-11-01')[0].original,'2026-10-21');
});
test('variable times use the anchor reservation only, then require per-visit confirmation', () => {
  const events = S.expand([make({ time_mode: '매회 확인' })], S.normalizeExceptions([{ event_id:'a', original_date:'2026-11-04', action:'시간 확정', time:'15:30' }]), '2026-10-07','2026-11-18');
  assert.deepEqual(events.map(e => e.time), ['11:00','','15:30','']);
  assert.equal(events[1].needsTime,true);
});
test('end dates, inactive schedules, missing dates and unsupported rules are handled', () => {
  assert.equal(S.expand([make({ end_date:'2026-10-21' })],[],'2026-10-01','2026-12-31').length,2);
  assert.equal(S.expand([make({ active:'중단' })],[],'2026-10-01','2026-12-31').length,0);
  assert.equal(make({ date:'' }).issue,'예약 날짜 확인 필요');
  assert.equal(make({ repeat:'매월' }).issue,'반복 규칙 확인 필요');
});
test('single events remain single and schedules are not limited to ten', () => {
  assert.equal(S.expand([make({ repeat:'' })],[],'2026-10-01','2026-12-31').length,1);
  const rows = S.legacyRows({ event15_title:'치과', event15_date:'2026-10-19', event15_time:'9:30' });
  assert.equal(rows[0].id,'event15');
});
test('malformed exceptions are identified rather than silently reusing the original reservation', () => {
  assert.equal(S.normalizeExceptions([{event_id:'a',original_date:'2026-10-21',action:'변경',time:'99:30'}])[0].issue,'변경사항 입력 확인 필요');
  assert.equal(S.normalizeExceptions([{event_id:'a',original_date:'2026-10-21',action:'변경',date:'2026-02-30'}])[0].issue,'변경사항 입력 확인 필요');
  assert.equal(S.normalizeExceptions([{event_id:'a',original_date:'2026-10-21',action:'취소'}])[0].issue,'');
});
test('agenda shows one next occurrence per repeating ID, while leaving calendar events intact', () => {
  const schedules = [make({id:'a',date:'2026-10-13',time:'11:00',repeat:'1주마다'}),make({id:'b',date:'2026-10-14',repeat:'2주마다'}),make({id:'one',date:'2026-10-13',time:'09:00',repeat:''})];
  const all = S.expand(schedules,[],'2026-10-12','2026-11-30');
  const list = S.agenda(all,new Date('2026-10-13T00:00:00Z'));
  assert.equal(list.filter(e=>e.id==='a').length,1);
  assert.equal(list.filter(e=>e.id==='b').length,1);
  assert.equal(list.find(e=>e.id==='a').date,'2026-10-13');
  assert.ok(all.filter(e=>e.id==='a').length>1);
  const advanced = S.agenda(all,new Date('2026-10-13T02:00:00Z'));
  assert.equal(advanced.find(e=>e.id==='a').date,'2026-10-20');
  assert.ok(advanced.find(e=>e.id==='one'));
});
test('agenda skips cancelled occurrences and holds an unconfirmed time until its date ends', () => {
  const all = S.expand([make({id:'a',date:'2026-10-13',time:'',repeat:'1주마다'})],S.normalizeExceptions([{event_id:'a',original_date:'2026-10-20',action:'취소'}]),'2026-10-12','2026-11-30');
  assert.equal(S.agenda(all,new Date('2026-10-13T14:59:00Z'))[0].date,'2026-10-13');
  assert.equal(S.agenda(all,new Date('2026-10-13T15:00:00Z'))[0].date,'2026-10-27');
});
test('rain earlier today does not trigger an umbrella message for a dry remaining day', () => {
  const times = Array.from({length:24},(_,i) => '2026-10-13T' + String(i).padStart(2,'0') + ':00');
  const data = { current:{apparent_temperature:20,weather_code:0}, hourly:{time:times,precipitation_probability:times.map((_,i)=>i<7?95:0),apparent_temperature:times.map(()=>20),wind_speed_10m:times.map(()=>5)} };
  const comment = S.weatherComment(data,new Date('2026-10-13T03:00:00Z'),[]);
  assert.equal(comment.includes('우산'),false);
  data.hourly.precipitation_probability[14]=80;
  assert.equal(S.weatherComment(data,new Date('2026-10-13T03:00:00Z'),[new Date('2026-10-13T05:00:00Z')]).includes('외출할 때 비'),true);
  data.current.apparent_temperature=2;
  data.hourly.apparent_temperature=times.map(()=>2);
  assert.equal(S.weatherComment(data,new Date('2026-10-13T03:00:00Z'),[]).includes('따뜻한 겉옷'),true);
});
test('ordinary dry weather still produces clothing advice instead of an unrelated schedule reminder', () => {
  const data = { current:{apparent_temperature:19,weather_code:0}, hourly:{time:['2026-10-13T12:00'],precipitation_probability:[0],apparent_temperature:[19],wind_speed_10m:[5]} };
  const now = new Date('2026-10-13T03:00:00Z');
  assert.ok(S.weatherComment(data,now,[]).includes('얇은 겉옷'));
  data.current.apparent_temperature=22; data.hourly.apparent_temperature=[22];
  assert.ok(S.weatherComment(data,now,[]).includes('온화'));
  data.current.apparent_temperature=25; data.hourly.apparent_temperature=[25];
  assert.ok(S.weatherComment(data,now,[]).includes('가벼운 옷차림'));
  data.hourly.time=['2026-10-12T12:00'];
  assert.ok(S.weatherComment(data,now,[]).includes('가벼운 옷차림'));
});
test('new Korean sheet rows work without a manual ID and stay stable after reordering', () => {
  const row={'일정':'새 일정','기준날짜':'2026-10-20','시간':'9:30','반복':'없음','중단':false};
  assert.equal(S.normalize(row,0).id,S.normalize(row,9).id);
  assert.equal(S.normalize(row).active,true);
  assert.equal(S.normalize({...row,'중단':'TRUE'}).active,false);
  const schedules=[S.normalize(row)];
  const exception=S.normalizeExceptions([{'일정':'새 일정','원래날짜':'2026-10-20','처리':'시간 확정','변경시간':'10:30'}],schedules)[0];
  assert.equal(exception.id,schedules[0].id);
  assert.equal(exception.issue,'');
  assert.equal(S.expand(schedules,[exception],'2026-10-19','2026-10-21')[0].time,'10:30');
});
test('alerts start exactly at 15 minutes before the appointment, independent of travel time', () => {
  const events=S.expand([make({date:'2026-10-13',time:'12:20',travel_minutes:'40'})],[],'2026-10-13','2026-10-13');
  assert.equal(S.dueAlerts(events,{},new Date('2026-10-13T03:04:59Z')).length,0);
  const due=S.dueAlerts(events,{},new Date('2026-10-13T03:05:00Z'));
  assert.equal(due.length,1);
  assert.equal(due[0].mins,15);
  assert.equal(S.dueAlerts(events,{[due[0].id]:'2026-10-13'},new Date('2026-10-13T03:10:00Z')).length,0);
  assert.equal(S.dueAlerts(events,{},new Date('2026-10-13T03:20:00Z')).length,0);
});
test('cancelled and unconfirmed appointments are silent; late opening uses the actual remaining minutes', () => {
  const events=S.expand([make({date:'2026-10-13',time:'12:20',title:'💓 코나 심리상담센터'})],[],'2026-10-13','2026-10-13');
  const due=S.dueAlerts(events,{},new Date('2026-10-13T03:13:00Z'))[0];
  assert.equal(S.alertSpeech(due),'7분 뒤, 오후 12시 20분에 코나 심리상담센터 일정이 있어. 준비해줘.');
  assert.equal(S.dueAlerts([{...events[0],cancelled:true},{...events[0],time:''}],{},new Date('2026-10-13T03:13:00Z')).length,0);
});
