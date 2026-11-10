const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../schedule.js');
const P = require('../payments.js');
const at = day => new Date(day+'T12:00:00+09:00');
const academy = () => S.normalize({id:'event3',title:'와이랩',date:'2026-10-04',time:'14:00',repeat:'1주마다',묶음횟수:'4',결제묶음시작일:'2026-11-01',결제일:'2026-10-27'});
const events = (schedules,start='2026-11-01',end='2027-01-10',exceptions=[]) => S.expand(schedules,exceptions,start,end);
test('paid academy package starts Nov 1 and next payment is Nov 29; appears exactly 7 days before',()=>{
 const rows=events([academy()]);
 assert.equal(rows.find(e=>e.date==='2026-11-15').package.paidOn,'2026-10-27');
 assert.equal(P.reminders(rows,at('2026-11-21')).length,0);
 assert.equal(P.reminders(rows,at('2026-11-22'))[0].dueDate,'2026-11-29');
 assert.equal(P.reminders(rows,at('2026-11-22'))[0].label,'D-7');
 assert.equal(P.reminders(rows,at('2026-11-25'))[0].urgent,false);
 assert.equal(P.reminders(rows,at('2026-11-26'))[0].urgent,true);
 assert.equal(P.reminders(rows,at('2026-11-29'))[0].label,'D-DAY');
 assert.equal(P.reminders(rows,at('2026-11-30'))[0].label,'기한 1일 지남');
});
test('five weekly Kona lessons starting Nov 3 lead to next payment Dec 8',()=>{
 const kona=S.normalize({id:'event4',title:'코나',date:'2026-11-03',time:'11:00',repeat:'1주마다',묶음횟수:'5',결제묶음시작일:'2026-11-03',결제일:'2026-11-03'});
 const rows=events([kona]);
 assert.deepEqual(rows.slice(0,5).map(e=>e.package.lesson),[1,2,3,4,5]);
 assert.equal(P.reminders(rows,at('2026-12-01'))[0].dueDate,'2026-12-08');
 assert.equal(P.reminders(rows,at('2026-12-05'))[0].label,'D-3');
});
test('confirmed shared receipt hides this cycle and calculates the next one, without device-local dismissal',()=>{
 const paid=P.receipt(academy(),{id:'event3',packageStart:'2026-11-29',paidOn:'2026-11-26'});
 assert.equal(P.reminders(events([paid]),at('2026-11-26')).length,0);
 assert.equal(P.reminders(events([paid]),at('2026-12-20'))[0].dueDate,'2026-12-27');
 assert.equal(P.receipt(paid,{id:'event3',packageStart:'2026-11-01',paidOn:'2026-10-27'}).packageStart,'2026-11-29');
 assert.equal(P.receipt(paid,{id:'other',packageStart:'2026-12-27',paidOn:'2026-12-20'}),paid);
});
test('cancelled lessons do not consume prepaid lessons or generate payment alerts',()=>{
 const exceptions=S.normalizeExceptions([{event_id:'event3',original_date:'2026-11-08',action:'취소'}]);
 const rows=events([academy()],'2026-11-01','2027-01-10',exceptions);
 assert.equal(P.reminders(rows,at('2026-11-29'))[0].dueDate,'2026-12-06');
 assert.equal(P.reminders(rows,at('2026-11-29')).length,1);
});
