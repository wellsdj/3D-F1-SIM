const fs=require('fs'),SD=__dirname;
// A pocket: two walls meeting in a narrow V, the shape a car gets wedged in.
global.WALLS=[
  [{x:-60,z:0},{x:0,z:0}],          // one face
  [{x:-60,z:6},{x:0,z:0}],          // the other, closing to a point
  [{x:0,z:0},{x:0,z:60}],           // and a wall across the end
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
global.BARR_BLEED_TAU=0.20; global.BARR_TURN_TAU=0.11;
global.BARR_MAX_TOUCH=0.10; global._freeX=null; global._freeZ=0; global._freeH=0;
const segapi=eval('(function(){'+fs.readFileSync(SD+'/seg.js','utf8')+
  '; return {wallsIndexBuild,barrBlocked,segsAround,SEG};})()');
global.segsAround=segapi.segsAround; global.SEG=segapi.SEG;
global.barrBlocked=segapi.barrBlocked;
segapi.wallsIndexBuild(null);
const src=fs.readFileSync(SD+'/barr.js','utf8');

function drive(label, startX, startZ, hdg, speed, frames){
  global.carState={wx:startX,wz:startZ,hdg,speed};
  global.PLAYER={bumpX:0,bumpZ:0,carVY:0};
  Object.assign(global,{BARR_HIT:0,BARR_LURCH:0,BARR_SHAKE:0,BARR_SPARK:0,
                        BARR_DMG:0,BARR_BLEED:0,BARR_TURN:0,BARR_TOUCH:0,_freeX:null});
  const api=eval('(function(){'+src+';return {barrCheck};})()');
  const dt=1/60;
  let run=0, worst=0, touching=0;
  /* What "stuck" actually means to a driver: the car is going nowhere. Timing
     unbroken CONTACT measures the wrong thing, because the escape hatch itself
     reports contact on the frame it fires -- so a car that is being ejected
     over and over looks permanently stuck while actually moving. Longest
     stretch covering less than two metres is the honest measure. */
  const trail=[];
  for(let f=0;f<frames;f++){
    carState.speed=Math.max(carState.speed, 30);      // driver keeps the power on
    carState.wx+=Math.sin(carState.hdg)*carState.speed*dt;
    carState.wz+=Math.cos(carState.hdg)*carState.speed*dt;
    if(PLAYER.bumpX||PLAYER.bumpZ){
      carState.wx+=PLAYER.bumpX*dt; carState.wz+=PLAYER.bumpZ*dt;
      const k=Math.pow(0.02,dt/0.30); PLAYER.bumpX*=k; PLAYER.bumpZ*=k;
    }
    const t=api.barrCheck(dt);
    if(t) touching++;
    trail.push([carState.wx, carState.wz]);
  }
  for(let i=0;i<trail.length;i++){
    let j=i;
    while(j+1<trail.length &&
          Math.hypot(trail[j+1][0]-trail[i][0], trail[j+1][1]-trail[i][1])<2) j++;
    worst=Math.max(worst,(j-i)*dt);
  }
  const inside=barrBlocked(carState.wx,carState.wz,carState.hdg);
  console.log(`  ${label.padEnd(28)} longest unbroken contact ${worst.toFixed(2)} s, `+
              `touching ${touching} of ${frames} frames, ends inside a wall: ${inside?'YES':'no'}`);
  return {worst, inside};
}
console.log('a car held at full throttle into a dead end:');
const a=drive('straight into the apex',   -40, 3.0, Math.PI/2, 60, 600);
const b=drive('into the corner at 45 deg', -40, 3.0, Math.PI/2-0.6, 60, 600);
const c=drive('started INSIDE the wall',    -30, 0.0, Math.PI/2, 60, 600);
const fails=[];
for(const [n,r] of [['apex',a],['45 deg',b],['inside',c]]){
  if(r.worst>1.0) fails.push(`${n}: went nowhere for ${r.worst.toFixed(2)} s`);
  if(r.inside)    fails.push(`${n}: finished inside a wall`);
}
console.log(fails.length?'\nFAIL:\n  '+fails.join('\n  '):
  '\nPASS - the car never goes nowhere for a second, and never ends up inside a wall');
process.exit(fails.length?1:0);
