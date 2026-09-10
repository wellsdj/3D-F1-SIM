const test=require('node:test'),assert=require('node:assert/strict'),P=require('../collision-physics.js');
const car=(x,z,h,v)=>({st:{wx:x,wz:z,hdg:h,speed:v},bumpX:0,bumpZ:0,impactYaw:0});
const energy=c=>{const v=P.velocity(c);return (v.x*v.x+v.z*v.z+((.86*.86+2.35*2.35)/3)*c.impactYaw*c.impactYaw)/2;};
test('same-speed side contact does not brake either car',()=>{const a=car(0,0,0,70),b=car(1.7,0,0,70);const h=P.solve(a,b);assert.equal(h.closing,0);assert.equal(a.st.speed,70);assert.equal(b.st.speed,70);assert.ok(b.st.wx-a.st.wx>=1.717);});
test('centred rear impact transfers momentum without invented energy or yaw',()=>{const a=car(0,0,0,70),b=car(0,4.5,0,40),before=energy(a)+energy(b);P.solve(a,b);assert.ok(a.st.speed<70);assert.ok(b.st.speed>40);assert.ok(Math.abs(a.st.speed+b.st.speed-110)<1e-9);assert.ok(energy(a)+energy(b)<=before);assert.equal(a.impactYaw,0);assert.equal(b.impactYaw,0);});
test('offset impact produces rotation, remains finite and loses energy',()=>{const a=car(0,0,0,65),b=car(.9,4.4,.15,20),before=energy(a)+energy(b);P.solve(a,b);assert.ok(Math.abs(a.impactYaw)+Math.abs(b.impactYaw)>0);assert.ok(Number.isFinite(energy(a)+energy(b)));assert.ok(energy(a)+energy(b)<=before+1e-6);});
test('separating cars receive no second impulse',()=>{const a=car(0,0,0,20),b=car(0,4.4,0,40);const h=P.solve(a,b);assert.equal(h.closing,0);assert.equal(a.st.speed,20);assert.equal(b.st.speed,40);});
test('barrier scrape preserves tangential motion; head-on hit rebounds',()=>{const a=car(0,0,0,70);a.bumpX=3;P.impulse(a,null,{nx:1,nz:0,x:0,z:0});const va=P.velocity(a);assert.ok(va.x<=0);assert.ok(va.z>68);const b=car(0,0,0,70);P.impulse(b,null,{nx:0,nz:1,x:0,z:2.35});assert.ok(P.velocity(b).z<0);assert.ok(energy(b)<energy(car(0,0,0,70)));});
test('rotated distant rectangles do not collide',()=>{assert.equal(P.overlap(car(0,0,.5,0).st,car(12,12,-.4,0).st),null);});
test('high-speed crossing is caught between frames',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
 const a=car(0,6,0,100),b=car(0,-6,Math.PI,100);a._collisionPrev={wx:0,wz:-3,hdg:0};b._collisionPrev={wx:0,wz:3,hdg:Math.PI};
 const ctx={CollisionPhysics:P,wingImpact(){}};vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function carsTouch(A,B,dt){'),source.indexOf('function carContact(dt){',source.indexOf('function carsTouch(A,B,dt){'))),ctx);
 assert.equal(ctx.carsTouch(a,b,.09),true);assert.ok(a.st.wz<b.st.wz);
});
test('swept barrier contact catches a thin wall even when the end pose is clear',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
 const c=car(0,5,0,90);c._collisionPrev={wx:0,wz:0,hdg:0};
 const ctx={CollisionPhysics:P,SEG:{n:1},PLAYER:{},wingImpact(){},barrBlocked:(x,z)=>z>=1&&z<=1.3,barrNormal:()=>({x:0,z:-1})};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function collisionWall(C,dt){'),source.indexOf('function carsTouch(A,B,dt){')),ctx);
 assert.equal(ctx.collisionWall(c,1/30),true);assert.ok(c.st.wz<1);assert.ok(P.velocity(c).z<=0);
});
