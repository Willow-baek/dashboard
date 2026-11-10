const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function server(initial={}) {
 const props={FAMILY_KEY:'family',TTS_ENABLED:'true',TTS_API_KEY:'private-key',...initial};
 let calls=0, sheets=0, payload;
 const properties={getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v};
 const ctx={console,Date,JSON,Number,String,Array,Error,isNaN,
  PropertiesService:{getScriptProperties:()=>properties},
  SpreadsheetApp:{openById:()=>{sheets++;throw Error('must not access payment sheets');}},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  Utilities:{formatDate:()=> '2026-11'},
  UrlFetchApp:{fetch:(url,options)=>{calls++;payload=JSON.parse(options.payload);assert.equal(options.headers['X-Goog-Api-Key'],'private-key');assert.equal(url,'https://texttospeech.googleapis.com/v1/text:synthesize');return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({audioContent:'audio'})};}},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>text})}};
 vm.createContext(ctx);
 ['Tts.gs','Payments.gs'].forEach(file=>vm.runInContext(fs.readFileSync(require.resolve('../apps-script/'+file),'utf8'),ctx));
 return {post:body=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(body)}})),props,get calls(){return calls;},get sheets(){return sheets;},get payload(){return payload;}};
}
test('Cloud TTS authenticates family key, never touches payment sheets or exposes API key',()=>{
 const s=server();assert.equal(s.post({action:'tts',key:'wrong',text:'안녕'}).ok,false);assert.equal(s.calls,0);
 const result=s.post({action:'tts',key:'family',text:'안녕'});assert.equal(result.ok,true);assert.equal(s.calls,1);assert.equal(s.sheets,0);
 assert.equal(s.payload.voice.name,'ko-KR-Neural2-A');assert.equal(result.used,2);assert.ok(!JSON.stringify(result).includes('private-key'));
});
test('monthly 50k cap blocks before provider call and cannot be raised by caller',()=>{
 const s=server({'TTS_CHARS_2026-11':'49998'});
 assert.equal(s.post({action:'tts',key:'family',text:'안녕',limit:1000000}).ok,true);
 const denied=s.post({action:'tts',key:'family',text:'다음'});assert.equal(denied.code,'monthly_limit');assert.equal(s.calls,1);assert.equal(s.props['TTS_CHARS_2026-11'],'50000');
});
test('disabled credentials, corrupt usage and oversized chunks fail closed without charges',()=>{
 for(const props of [{TTS_ENABLED:'false'},{TTS_API_KEY:''},{'TTS_CHARS_2026-11':'invalid'}]) {const s=server(props);assert.equal(s.post({action:'tts',key:'family',text:'안녕'}).ok,false);assert.equal(s.calls,0);}
 const s=server();assert.equal(s.post({action:'tts',key:'family',text:'가'.repeat(801)}).ok,false);assert.equal(s.calls,0);
});
