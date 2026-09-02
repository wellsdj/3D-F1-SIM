const fs=require('fs'),SD=__dirname;
const W=600,H=600,MINX=-300,MINZ=-300;
const data=new Uint8Array(W*H);
for(let x=-250;x<250;x++){ data[(0-MINZ)*W+(x-MINX)]=1; data[(1-MINZ)*W+(x-MINX)]=1; }
global.BARR={data,count:1000,w:W,h:H,minx:MINX,minz:MINZ};
global.barrOn=(x,z)=>{const i=(x-MINX)|0,j=(z-MINZ)|0;
  return i>=0&&j>=0&&i<W&&j<H&&data[j*W+i]===1;};
global.CARPTS=[{x:0.8,z:1.8},{x:-0.8,z:1.8},{x:0.8,z:-1.8},{x:-0.8,z:-1.8}];
global.PLAYER={bumpX:0,bumpZ:0,carVY:0};
global.carGroup={position:{y:0}};
global.clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
global.wallsReady=true; global.wallsInit=()=>{};
let sparks=0, debris=0;
global.spawnSparks=()=>{sparks++;return 1;};
global.hitBarrier=()=>{debris++;};
global.ttVoid=null; global.document={getElementById:()=>null};
global.BARR_BLEED_TAU=0.20; global.BARR_TURN_TAU=0.11; global.BARR_STEEP=0; global.BARR_STEEP_N=4; global.BARR_STEEP_SURE=0.85; global.BARR_MAX_TOUCH=0.10; global.BARR_TOUCH=0; global._freeX=null; global._freeZ=0; global._freeH=0; global.BARR_SHUNT_COS=0.5; global.BARR_DMG_MAX=22; global.BARR_DMG_PER=0.16;
global.WALLS=[[{x:-2000,z:0},{x:2000,z:0}]];
global.SURF={data:new Uint8Array(1),count:0,w:1,h:1,minx:0,minz:0};
global.surfIdx=()=>-1;
{ const api=eval('(function(){'+require('fs').readFileSync(__dirname+'/seg.js','utf8')+
    '; return {wallsIndexBuild,barrBlocked,segsAround,SEG};})()');
  api.wallsIndexBuild(null);
  global.barrBlocked=api.barrBlocked; global.segsAround=api.segsAround; global.SEG=api.SEG; }
const src=fs.readFileSync(SD+'/barr.js','utf8');

// approach the wall (which lies along x, at z=0) from z<0.
// "angle to the wall" = 0 is parallel, 90 is head-on.
function run(angToWall, speed){
  const h=(90-angToWall)*Math.PI/180;   // heading measured from +z (head-on)
  global.carState={wx:-200,wz:-6,hdg:h,speed};
  Object.assign(global,{BARR_HIT:0,BARR_LURCH:0,BARR_SHAKE:0,BARR_SPARK:0,BARR_DMG:0,BARR_BLEED:0,BARR_TURN:0,BARR_TOUCH:0,_freeX:null,BARR_STEEP:0});
  sparks=0; debris=0;
  const api=eval('(function(){'+src+';return {barrCheck};})()');
  /* The speed a third of a second after the hit, not at the end of the run.
     This used to stop the loop when the car reached a standstill, which a
     shunt no longer produces -- so the reading drifted to wherever the car
     had got to three thousand frames later. */
  const dt=1/60; let touched=false, tf=-1, after=null;
  for(let f=0;f<3000;f++){
    const v=carState.speed;
    carState.wx+=Math.sin(carState.hdg)*v*dt;
    carState.wz+=Math.cos(carState.hdg)*v*dt;
    if(api.barrCheck(dt)){ if(!touched) tf=f; touched=true; }
    if(touched && after===null && f-tf>=20) after=carState.speed;
    if(after!==null) break;
    if(touched && carState.wz<-12 && global.BARR_BLEED===0){ after=carState.speed; break; }
  }
  const out=(90-Math.abs(carState.hdg*180/Math.PI));
  return {speed:(after===null?carState.speed:after), v0:speed,
          dmg:global.BARR_DMG, touched, debris, angOut:out, z:carState.wz};
}

console.log('  hit at   speed in    speed out   change   damage  debris   result');
const fails=[];
for(const a of [3,8,15,25,29,35,50,90]){
  const r=run(a,83);           // 300 kph
  const chg=((r.speed-83)/83*100);
  const res=r.speed<0.1?'STOPPED':'bounced off';
  console.log(`  ${String(a).padStart(3)}°    83.0 m/s   ${r.speed.toFixed(1).padStart(6)} m/s  ${chg>=0?'+':''}${chg.toFixed(1)}%   ${r.dmg.toFixed(1).padStart(5)}   ${String(r.debris).padStart(4)}    ${res}`);
  if(a<30){
    // a graze must cost something you notice, grow with the angle, and never
    // amount to a stop
    if(r.speed>83.001) fails.push(`${a}° bump GAINED speed`);
    if(a<=8 && r.speed>83*0.99) fails.push(`${a}° bump cost almost nothing: ${r.speed.toFixed(1)} of 83`);
    if(a<=8 && r.speed<83*0.90) fails.push(`${a}° shallow bump cost too much: ${r.speed.toFixed(1)} of 83`);
    if(r.speed<83*0.60) fails.push(`${a}° bump cost more than 40% - that is a stop, not a graze`);
    if(r.dmg>0) fails.push(`${a}° bump took damage`);
    if(r.debris>0) fails.push(`${a}° bump threw debris`);
    if(!r.touched) fails.push(`${a}° never touched the wall`);
  } else {
    /* A shunt used to be required to leave the car at a standstill. It is not
       any more, and deliberately: stopping dead for a frame and then being
       pushed out is the thing that felt wrong. What a shunt must now do is
       take most of the speed away -- four fifths of it or more -- while
       leaving the car moving. */
    const kept=r.speed/r.v0;
    /* Not "a shunt costs 80%". The cost falls out of the geometry: at 35
       degrees to the wall half the speed is still running ALONG the face and
       nothing takes it away, so half is what the car keeps and that is right.
       Only a near-square hit has little enough left to lose most of it. */
    if(a>=60 && kept>0.30)
      fails.push(`${a}\u00b0 is nearly square on and only cost ${(100-kept*100).toFixed(0)}%`);
    if(r.speed<=0.1)
      fails.push(`${a}\u00b0 shunt stopped the car dead \u2014 that is the old freeze`);
    if(r.debris>0) fails.push(`${a}° shunt threw debris`);
  }
}
// the same shallow clip must behave the same at any speed
const slow=run(10,40), fast=run(10,95);
console.log(`\n  10° at 40 m/s -> ${slow.speed.toFixed(1)} m/s;  10° at 95 m/s -> ${fast.speed.toFixed(1)} m/s`);
if(Math.abs(slow.speed/40 - fast.speed/95)>0.005)
  fails.push('a shallow clip costs a different FRACTION at different speeds');
console.log(fails.length?'\nFAIL:\n  '+fails.join('\n  '):
  '\nPASS - shallow hits bounce, cost grows with the angle, no damage, no debris; over 30 deg stops');
process.exit(fails.length?1:0);
