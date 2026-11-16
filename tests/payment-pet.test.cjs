const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function scene(width=400) {
  const classes = new Set(), animations = [], timers = new Map();
  const overlay = {hidden:true};
  const document = {hidden:false,activeElement:null,getElementById:()=>overlay,addEventListener(){}};
  const window = {matchMedia:()=>({matches:false,addEventListener(){}})};
  const convoy = {
    offsetWidth:200,style:{},
    classList:{add:value=>classes.add(value),remove:value=>classes.delete(value),toggle:(value,on)=>on?classes.add(value):classes.delete(value)},
    animate() {
      const animation = {playState:'running',pause(){this.playState='paused';},play(){this.playState='running';},cancel(){this.playState='idle';}};
      animations.push(animation); return animation;
    }
  };
  const lane = {clientWidth:width,contains:()=>false,addEventListener(){}};
  let timerId=0;
  vm.runInNewContext(fs.readFileSync(require.resolve('../payment-pet.js'),'utf8'),{
    window,document,
    setTimeout(callback){timers.set(++timerId,callback); return timerId;},
    clearTimeout(id){timers.delete(id);}
  });
  const mover=window.DashboardPaymentPet.attach(lane,convoy);
  return {mover,pet:window.DashboardPaymentPet,classes,animations,timers,overlay};
}

test('repeated scene updates keep one pushing animation and preserve its rest', () => {
  const sceneState=scene();
  sceneState.mover.update(); sceneState.mover.update();
  assert.equal(sceneState.animations.length,1);
  sceneState.animations[0].onfinish();
  sceneState.mover.update();
  assert.equal(sceneState.animations.length,1);
  assert.equal(sceneState.timers.size,1);
  const callback=[...sceneState.timers.values()][0];
  sceneState.timers.clear(); callback();
  assert.equal(sceneState.animations.length,2);
});

test('dialog and manual pause freeze pushing, and disposal cancels the mover', () => {
  const sceneState=scene();
  sceneState.overlay.hidden=false; sceneState.mover.update();
  assert.equal(sceneState.animations[0].playState,'paused');
  sceneState.overlay.hidden=true; sceneState.mover.update();
  assert.equal(sceneState.animations[0].playState,'running');
  sceneState.pet.toggle();
  assert.equal(sceneState.animations[0].playState,'paused');
  sceneState.mover.dispose();
  assert.equal(sceneState.animations[0].playState,'idle');
  assert.equal(sceneState.timers.size,0);
});

test('narrow lanes keep the effort pose without moving the label out of bounds', () => {
  const sceneState=scene(200);
  assert.equal(sceneState.animations.length,0);
  assert.equal(sceneState.classes.has('is-pushing'),true);
  sceneState.pet.toggle();
  assert.equal(sceneState.classes.has('is-pushing'),false);
});
