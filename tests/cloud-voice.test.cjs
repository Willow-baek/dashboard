const test=require('node:test');
const assert=require('node:assert/strict');
const V=require('../cloud-voice.js');
function audio() {return {state:'running',destination:{},decodeAudioData:async x=>x,createBufferSource(){return {connect(){},start(){queueMicrotask(()=>this.onended());},stop(){if(this.onended)this.onended();}};}};}
test('Cloud voice queues chunks and reuses audio without extra synthesis',async()=>{
 let calls=0;const statuses=[];
 const voice=V.create({context:audio,decode:x=>x,request:async()=>{calls++;return {ok:true,audioContent:'mp3'};},status:(...args)=>statuses.push(args)});
 await voice.speak('안녕');await voice.speak('안녕');assert.equal(calls,1);assert.equal(statuses.at(-1)[0],'ready');
 assert.ok(V.chunks('가'.repeat(2000)).every(x=>x.length<=800));
 assert.ok(V.chunks('가'.repeat(799)+'😀끝').every(x=>!/[\uD800-\uDBFF]$/.test(x)));
});
test('monthly limit halts queued and later cloud requests',async()=>{
 let calls=0;const v=V.create({context:audio,decode:x=>x,status(){},request:async()=>{calls++;return {ok:false,code:'monthly_limit'};}});
 await v.speak('가'.repeat(2000));await v.speak('또 읽기');assert.equal(calls,1);
});
test('cancelled synthesis never starts playback after late response',async()=>{
 let resolve,played=0;const ctx=audio();ctx.createBufferSource=()=>({connect(){},start(){played++;},stop(){}});
 const v=V.create({context:()=>ctx,decode:x=>x,status(){},request:()=>new Promise(r=>resolve=r)});
 const pending=v.speak('테스트');await Promise.resolve();v.cancel();resolve({ok:true,audioContent:'mp3'});await pending;assert.equal(played,0);
});
