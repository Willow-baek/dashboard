const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function server() {
  const props={FAMILY_KEY:'test-family-key',SPREADSHEET_ID:'main',LEDGER_ID:'private'};
  const schedule=Array(16).fill('');
  Object.assign(schedule,{2:'코나',12:'event4',13:5,14:'2026-11-03',15:'2026-11-03'});
  const rows=[Array(16).fill('header'),schedule], ledgerRows=[['기록ID']];
  const sheet={getDataRange:()=>({getValues:()=>rows}),getRange:(row,col)=>({setValues:values=>{values[0].forEach((v,i)=>rows[row-1][col-1+i]=v);}})};
  const ledger={getDataRange:()=>({getValues:()=>ledgerRows}),appendRow:row=>ledgerRows.push(row)};
  const app={getId:()=> 'main',getSheetByName:()=>sheet,getSpreadsheetTimeZone:()=> 'Asia/Seoul'};
  const context={console,Date,JSON,Number,String,Array,Error,isNaN,
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})},
    SpreadsheetApp:{openById:id=>{assert.ok(id==='main'||id==='private');return id==='main'?app:{getSheetByName:()=>ledger};},flush:()=>{}},
    LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},
    Utilities:{formatDate:date=>new Date(date.getTime()+9*3600000).toISOString().slice(0,10)},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>text})}};
  vm.createContext(context); vm.runInContext(fs.readFileSync(require.resolve('../apps-script/Payments.gs'),'utf8'),context);
  return {post:body=>JSON.parse(context.doPost({postData:{contents:JSON.stringify(body)}})),rows,ledgerRows};
}
test('payment endpoint rejects missing/incorrect family keys and unknown schedules without writes',()=>{
 const s=server();
 assert.equal(s.post({action:'list'}).ok,false);
 assert.equal(s.post({action:'record',key:'wrong'}).ok,false);
 assert.equal(s.post({action:'record',key:'test-family-key',id:'other',requestId:'abcdef1234567890',packageStart:'2026-12-08'}).ok,false);
 assert.equal(s.ledgerRows.length,1);
 assert.equal(s.rows[1][14],'2026-11-03');
});
test('shared payment confirmation updates only package date/payment date and logs privately once',()=>{
 const s=server(), payload={action:'record',key:'test-family-key',id:'event4',requestId:'abcdef1234567890',packageStart:'2026-12-08',amount:450000,method:'카드'};
 const result=s.post(payload);
 assert.equal(result.ok,true);
 assert.equal(result.receipts[0].packageStart,'2026-12-08');
 assert.equal(s.ledgerRows.length,2);
 assert.equal(s.ledgerRows[1][6],450000);
 assert.equal(s.post(payload).alreadyRecorded,true);
 assert.equal(s.ledgerRows.length,2);
 assert.equal(s.post({...payload,requestId:'different12345678'}).alreadyRecorded,true);
 assert.equal(s.ledgerRows.length,2);
 assert.equal(s.post({action:'list',key:'test-family-key'}).receipts[0].packageStart,'2026-12-08');
 s.ledgerRows[1][3]=new Date(s.ledgerRows[1][3]+'T00:00:00+09:00');
 s.ledgerRows[1][4]=new Date('2026-12-08T00:00:00+09:00');
 assert.equal(s.post(payload).alreadyRecorded,true);
 assert.equal(s.ledgerRows.length,2);
});
test('invalid dates, invalid amounts and stale payment cycles are rejected',()=>{
 const s=server(), base={action:'record',key:'test-family-key',id:'event4',requestId:'abcdef1234567890',packageStart:'2026-12-08'};
 assert.equal(s.post({...base,packageStart:'2026-02-30'}).ok,false);
 assert.equal(s.post({...base,packageStart:'2026-10-01'}).ok,false);
 assert.equal(s.post({...base,amount:-1}).ok,false);
 assert.equal(s.post({...base,amount:0.5}).ok,false);
 assert.equal(s.ledgerRows.length,1);
});
