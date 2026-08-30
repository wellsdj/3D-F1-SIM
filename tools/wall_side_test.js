const fs=require('fs'),SD=__dirname;
/* A 10 m road with a wall a metre off each side -- the layout Wells has now.
   Drive into the RIGHT wall and see how far across the road the car ends up. */
global.WALLS=[
  [{x:-400,z:6},{x:400,z:6}],     // right-hand wall  (road is z = -5..5)
  [{x:-400,z:-6},{x:400,z:-6}],   // left-hand wall
];
global.SURF={data:new Uint8Array(1),count:0,w:1,h:1,minx:0,minz:0};
global.surfIdx=()=>-1;
global.CARPTS=[{x:0.8,z:1.8},{x:-0.8,z:1.8},{x:0.8,z:-1.8},{x:-0.8,z:-1.8}];
global.clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
global.carGroup={position:{y:0}}; global.document={getElementById:()=>null};
global.spawnSparks=()=>1; global.hitBarrier=null; global.ttVoid=null;
global.wallsReady=true; global.wallsInit=()=>{};
global.BARR={data:new Uint8Array(1),count:1};
global.BARR_SHUNT_COS=0.5; global.BARR_DMG_MAX=22; global.BARR_DMG_PER=0.16;
global.BARR_BLEED_TAU=0.20; global.BARR_TURN_TAU=0.11; global.BARR_MAX_TOUCH=0.10;
const segapi=eval('(function(){'+fs.readFileSync(SD+'/seg.js','utf8')+
  '; return {wallsIndexBuild,barrBlocked,segsAround,SEG};})()');
global.segsAround=segapi.segsAround; global.SEG=segapi.SEG;
global.barrBlocked=segapi.barrBlocked;
segapi.wallsIndexBuild(null);
const src=fs.readFileSync(SD+'/barr.js','utf8');

/* angDeg is the angle INTO the wall: 90 is square on, 10 is a shallow graze.
   The first version of this took it as a heading and labelled a 10-degree graze
   as "nearly head-on", which is how a normal drift across the road over 600 m
   of travel got read as the car being thrown. */
function run(angDeg, speed, label){
  const h=(90-angDeg)*Math.PI/180;   // heading; +z is the right-hand wall
  global.carState={wx:-200,wz:2.0,hdg:h,speed};
  global.PLAYER={bumpX:0,bumpZ:0,carVY:0};
  Object.assign(global,{BARR_HIT:0,BARR_LURCH:0,BARR_SHAKE:0,BARR_SPARK:0,BARR_DMG:0,
                        BARR_BLEED:0,BARR_TURN:0,BARR_TOUCH:0,_freeX:null,_freeZ:0,_freeH:0});
  const api=eval('(function(){'+src+';return {barrCheck};})()');
  const dt=1/60; let worstZ=carState.wz, jump=0, pz=carState.wz;
  let firstTouch=-1, zAfter=null, crossings=0, side=Math.sign(carState.wz);
  for(let f=0;f<600;f++){
    const v=carState.speed;
    carState.wx+=Math.sin(carState.hdg)*v*dt;
    carState.wz+=Math.cos(carState.hdg)*v*dt;
    if(PLAYER.bumpX||PLAYER.bumpZ){
      carState.wx+=PLAYER.bumpX*dt; carState.wz+=PLAYER.bumpZ*dt;
      const k=Math.pow(0.02,dt/0.30); PLAYER.bumpX*=k; PLAYER.bumpZ*=k;
    }
    const t=api.barrCheck(dt);
    if(t && firstTouch<0) firstTouch=f;
    if(firstTouch>=0 && zAfter===null && f-firstTouch>=18) zAfter=carState.wz;  // 0.3 s later
    const sNow=Math.sign(carState.wz);
    if(sNow!==0 && sNow!==side){ crossings++; side=sNow; }
    jump=Math.max(jump, Math.abs(carState.wz-pz) - Math.abs(Math.cos(carState.hdg)*v*dt) - 0.2);
    pz=carState.wz;
    worstZ=Math.min(worstZ, carState.wz);       // most negative = furthest LEFT
  }
  if(zAfter===null) zAfter=carState.wz;
  console.log(`  ${label.padEnd(24)} z was +2.0, 0.3 s after contact z=${zAfter.toFixed(1)}`+
              `, biggest one-frame sideways move ${Math.max(0,jump).toFixed(2)} m`+
              `, crossed the middle ${crossings} time(s)`);
  return {zAfter, jump:Math.max(0,jump), crossings};
}
console.log('driving into the RIGHT-hand wall from the right of the road:');
const a=run(10, 60, 'graze, 10 deg in');
const b=run(40, 60, 'clip, 40 deg in');
const c=run(90, 60, 'square on, 90 deg in');
const fails=[];
for(const [n,r] of [['10 deg',a],['40 deg',b],['90 deg',c]]){
  if(r.zAfter<-1)  fails.push(`${n}: 0.3 s after hitting the RIGHT wall the car is at z=${r.zAfter.toFixed(1)}, left of the middle`);
  if(r.jump>1.5)   fails.push(`${n}: moved ${r.jump.toFixed(2)} m sideways in one frame`);
  if(r.crossings>1)fails.push(`${n}: ping-ponged across the road ${r.crossings} times`);
}
console.log(fails.length?'\nFAIL:\n  '+fails.join('\n  '):
  '\nPASS - hitting the right-hand wall leaves the car on the right of the road');
process.exit(fails.length?1:0);
