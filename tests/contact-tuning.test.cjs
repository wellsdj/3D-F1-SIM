const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const P=require('../collision-physics');
const car=v=>({st:{wx:0,wz:0,hdg:0,speed:v}});
test('car contact has half the equivalent static-wall impulse per unit effective mass',()=>{
 const a=car(60),b=car(0),wall=car(60),h={nx:0,nz:1,x:0,z:0};
 P.impulse(a,b,h);P.impulse(wall,null,h);
 const carChange=60-P.velocity(a).z,wallChange=60-P.velocity(wall).z;
 assert.ok(Math.abs(carChange-wallChange*.25)<1e-9); // two equal masses and half-strength response
 assert.ok(Math.abs(P.velocity(wall).z+7.2)<1e-9);
});
test('position-only solver passes do not amplify the softened impulse',()=>{
 const a=car(60),b=car(0);b.st.wz=4.6;P.solve(a,b);const before=[a.st.speed,b.st.speed,a.impactYaw,b.impactYaw];P.solve(a,b,false);assert.deepEqual([a.st.speed,b.st.speed,a.impactYaw,b.impactYaw],before);
});
test('final approach stays on throttle then commits immediately at the braking envelope',()=>{
 const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8'),start=source.indexOf('function aiPedals(d, C){');
 const ctx={AI:{lastApex:150},MAXSPEED:100,clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),aiFirstLimit:()=>Infinity,aiFirstProgress:()=>Infinity};vm.createContext(ctx);vm.runInContext(source.slice(start,source.indexOf('/* Shared car/barrier',start)),ctx);
 const d={i:0,ds:1,n:1000,len:1000,v:Array(1000).fill(60)};
 let p=ctx.aiPedals(d,{st:{speed:50}});assert.equal(p.thr,1);assert.equal(p.brk,0);
 p=ctx.aiPedals(d,{st:{speed:90}});assert.equal(p.thr,0);assert.ok(p.brk>.95);
});
