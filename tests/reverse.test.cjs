/* Reverse has one job: getting a car that is in trouble out of it. So it gets
   to its limit wherever the car is standing, gravel included. */
const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function lift(){
  const ctx={Math};
  const code=[/const REV_MAX=[^;]+;/, /const REV_ACCEL=[^;]+;/,
              /function applyPedals\(st, thr, brk, surf, dt, reverseEnabled, tow\)\{[\s\S]*?\n\}/,
              /function surfaceDrag\(st, surf, dt\)\{[\s\S]*?\n\}/]
    .map(re=>{ const m=source.match(re); assert.ok(m,'could not find '+re); return m[0]; }).join('\n');
  vm.runInNewContext(code+`
    function clamp(v,a,b){return v<a?a:v>b?b:v;}
    this.applyPedals=applyPedals; this.surfaceDrag=surfaceDrag;
    this.REV_MAX=REV_MAX;`,
    Object.assign(ctx,{MAXSPEED:100, CAR_TOP:1, carState:{}, WEATHER:{grip:1}}));
  return ctx;
}

/* Hold the brake from a standstill for three seconds on a given surface. */
function backUp(ctx, surf){
  const st={speed:0};
  for(let i=0;i<180;i++){
    ctx.applyPedals(st, 0, 1, surf, 1/60, true, 0);
    ctx.surfaceDrag(st, surf, 1/60);
  }
  return -st.speed*3.6;                       // kph, backwards
}

const TARMAC={loose:false, grass:false, looseFrac:0, grassFrac:0, ok:true};
const GRAVEL={loose:true,  grass:false, looseFrac:1, grassFrac:0, ok:false};
const GRASS ={loose:false, grass:true,  looseFrac:0, grassFrac:1, ok:false};

test('reverse reaches its full 35 kph on every surface, not just tarmac',()=>{
  const ctx=lift();
  const limit=ctx.REV_MAX*3.6;
  assert.ok(Math.abs(limit-35)<0.01, 'the limit is still 35 kph: '+limit);
  for(const [name,surf] of [['tarmac',TARMAC],['gravel',GRAVEL],['grass',GRASS]]){
    const kph=backUp(ctx,surf);
    assert.ok(kph>34.9, name+' only reached '+kph.toFixed(1)+' kph backwards');
  }
});

test('it takes a moment to get there, rather than snapping to the limit',()=>{
  const ctx=lift();
  const st={speed:0};
  const at=[];
  for(let i=0;i<180;i++){
    ctx.applyPedals(st, 0, 1, GRAVEL, 1/60, true, 0);
    ctx.surfaceDrag(st, GRAVEL, 1/60);
    if(i===5||i===20) at.push(-st.speed*3.6);
  }
  assert.ok(at[0]<12, 'a tenth of a second in it is still winding up: '+at[0].toFixed(1));
  assert.ok(at[1]>at[0], 'and it is still building: '+at[1].toFixed(1));
});

test('forwards, the surfaces drag exactly as they did',()=>{
  const ctx=lift();
  /* Rolling forwards at 30 m/s, one second of gravel and one of grass. */
  const roll=surf=>{ const st={speed:30};
    for(let i=0;i<60;i++) ctx.surfaceDrag(st,surf,1/60);
    return st.speed; };
  assert.ok(roll(GRAVEL)<8, 'gravel still all but stops a car: '+roll(GRAVEL).toFixed(1));
  assert.ok(roll(GRASS)<29, 'grass still slows one: '+roll(GRASS).toFixed(1));
  assert.equal(roll(TARMAC),30, 'and tarmac never did');
});

test('the exemption is written where it can be read',()=>{
  assert.match(source,/function surfaceDrag\(st, surf, dt\)\{[\s\S]{0,700}if\(st\.speed<0\) return;/);
});

/* The real bug was one line under the car, not in the pedals: the collision
   layer clamped the forward component at zero every time a velocity went
   through it, and a knock leaves a decaying impactYaw that keeps feeding it
   through for seconds afterwards. */
const CollisionPhysics=require('../collision-physics.js');

test('a velocity round trip keeps the car going backwards',()=>{
  const car={st:{wx:0,wz:0,hdg:0,speed:-9},bumpX:0,bumpZ:0};
  const v=CollisionPhysics.velocity(car);
  CollisionPhysics.setVelocity(car,v.x,v.z);
  assert.ok(Math.abs(car.st.speed+9)<1e-6, 'reverse survived: '+car.st.speed);
  assert.ok(Math.abs(car.bumpX)<1e-6 && Math.abs(car.bumpZ)<1e-6,
            'and none of it leaked into the sideways bump');
});

test('but a shunt cannot launch a car backwards for ever',()=>{
  const car={st:{wx:0,wz:0,hdg:0,speed:0},bumpX:0,bumpZ:0};
  CollisionPhysics.setVelocity(car,0,-400);        // an absurd backwards blow
  assert.ok(car.st.speed>=-12, 'floored: '+car.st.speed);
  assert.ok(car.st.speed<-9, 'but still properly backwards: '+car.st.speed);
});

test('forwards is untouched',()=>{
  const car={st:{wx:0,wz:0,hdg:0,speed:0},bumpX:0,bumpZ:0};
  CollisionPhysics.setVelocity(car,0,60);
  assert.ok(Math.abs(car.st.speed-60)<1e-6);
});
