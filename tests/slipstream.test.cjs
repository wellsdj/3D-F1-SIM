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
  assert.ok(near>Slipstream.strength(car(0,0),[car(3.5,12)]));
});
test('no false tow behind, in opposing traffic, or at low speed',()=>{
  assert.equal(Slipstream.strength(car(0,0),[car(0,-10)]),0);
  assert.equal(Slipstream.strength(car(0,0),[car(0,10,Math.PI)]),0);
  assert.equal(Slipstream.strength(car(0,0,0,10),[car(0,10)]),0);
});
test('tow attacks quickly and releases progressively',()=>{
  const attack=Slipstream.smooth(0,1,0.1);
  const release=Slipstream.smooth(1,0,0.1);
  assert.ok(attack>0 && attack<1 && release>attack);
});
