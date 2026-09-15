const test=require('node:test');
const assert=require('node:assert/strict');
const Slipstream=require('../slipstream.js');
const car=(wx,wz,hdg=0,speed=80)=>({wx,wz,hdg,speed});

test('strong tow directly behind a nearby car',()=>{
  assert.ok(Slipstream.strength(car(0,0),[car(0,12)])>0.8);
});
test('tow fades with distance and lateral offset',()=>{
  const near=Slipstream.strength(car(0,0),[car(0,12)]);
  assert.ok(near>Slipstream.strength(car(0,0),[car(0,45)]));
  assert.equal(Slipstream.strength(car(0,0),[car(2.3,12)]),0);
});
test('tow exists only inside a one-second gap',()=>{
  assert.ok(Slipstream.strength(car(0,0,0,50),[car(0,54,0,50)])>0);
  assert.equal(Slipstream.strength(car(0,0,0,50),[car(0,55,0,50)]),0);
});
test('no false tow behind, in opposing traffic, or at low speed',()=>{
  assert.equal(Slipstream.strength(car(0,0),[car(0,-10)]),0);
  assert.equal(Slipstream.strength(car(0,0),[car(0,10,Math.PI)]),0);
  assert.equal(Slipstream.strength(car(0,0,0,10),[car(0,10)]),0);
});
test('tow attacks smoothly but disappears quickly when pulling out',()=>{
  const attack=Slipstream.smooth(0,1,0.1);
  const release=Slipstream.smooth(1,0,0.1);
  assert.ok(attack>0 && attack<1 && release<attack);
});
test('presentation identifies straights without changing corner physics',()=>{
  assert.equal(Slipstream.isStraight({x:0,z:0},{x:0,z:10},{x:0,z:20}),true);
  assert.equal(Slipstream.isStraight({x:0,z:0},{x:0,z:10},{x:10,z:10}),false);
});
