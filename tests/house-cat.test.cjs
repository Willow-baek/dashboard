const test = require('node:test');
const assert = require('node:assert/strict');
const Cat = require('../house-cat.js');

test('cat cycles punch, lying tail swish and walking, then repeats', () => {
  assert.equal(Cat.behavior(0,100,false),'punch');
  assert.equal(Cat.behavior(11999,100,false),'punch');
  assert.equal(Cat.behavior(12000,100,false),'rest');
  assert.equal(Cat.behavior(31999,100,false),'rest');
  assert.equal(Cat.behavior(32000,100,false),'walk');
  assert.equal(Cat.behavior(47999,100,false),'walk');
  assert.equal(Cat.behavior(48000,100,false),'punch');
});

test('cat rests instead of walking without enough clear space', () => {
  assert.equal(Cat.behavior(35000,31,false),'rest');
  assert.equal(Cat.behavior(35000,32,false),'walk');
});

test('important reminders interrupt every ordinary activity to push', () => {
  [0,15000,35000].forEach(elapsed => {
    assert.equal(Cat.behavior(elapsed,0,true),'push');
  });
});

test('earliest departure wins over earlier start, excluding past and hidden rows', () => {
  const past = {start:99,deadline:50,visible:true};
  const hidden = {start:200,deadline:100,visible:false};
  const earlyStart = {start:200,deadline:200,visible:true};
  const earlyDeparture = {start:300,deadline:150,visible:true};
  assert.equal(Cat.select([past,hidden,earlyStart,earlyDeparture],100),earlyDeparture);
  assert.equal(Cat.select([past,hidden],100),null);
});
