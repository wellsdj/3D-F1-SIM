const fs=require('fs'),SD=__dirname;
global.WALLS=[[{x:-400,z:6},{x:400,z:6}]];          // one long wall at z=+6
global.SURF={data:new Uint8Array(1),count:0,w:1,h:1,minx:0,minz:0};
global.surfIdx=()=>-1;
global.CARPTS=[{x:0.8,z:1.8},{x:-0.8,z:1.8},{x:0.8,z:-1.8},{x:-0.8,z:-1.8}];
global.clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
global.carGroup={position:{y:0}}; global.document={getElementById:()=>null};
global.spawnSparks=()=>1; global.hitBarrier=null; global.ttVoid=null;
global.wallsReady=true; global.wallsInit=()=>{}; global.BARR={data:new Uint8Array(1),count:1};
global.BARR_SHUNT_COS=0.5; global.BARR_DMG_MAX=22; global.BARR_DMG_PER=0.16;
global.BARR_BLEED_TAU=0.20; global.BARR_TURN_TAU=0.11; global.BARR_MAX_TOUCH=0.10;
const seg=eval('(function(){'+fs.readFileSync(SD+'/seg.js','utf8')+
  '; return {wallsIndexBuild,barrBlocked,segsAround,SEG};})()');
global.segsAround=seg.segsAround; global.SEG=seg.SEG; global.barrBlocked=seg.barrBlocked;
seg.wallsIndexBuild(null);
const src=fs.readFileSync(SD+'/barr.js','utf8');

function run(deg, kph){
  const h=(90-deg)*Math.PI/180, v0=kph/3.6;
  global.carState={wx:-60,wz:2.0,hdg:h,speed:v0};
  global.PLAYER={bumpX:0,bumpZ:0,carVY:0};
  Object.assign(global,{BARR_HIT:0,BARR_LURCH:0,BARR_SHAKE:0,BARR_SPARK:0,BARR_DMG:0,
                        BARR_BLEED:0,BARR_TURN:0,BARR_TOUCH:0,_freeX:null,_freeZ:0,_freeH:0});
  const api=eval('(function(){'+src+';return {barrCheck};})()');
  const dt=1/60; let touched=-1, frozen=0, worst=0, run0=0, trace=[];
  for(let f=0;f<240;f++){
    const v=carState.speed;
    carState.wx+=Math.sin(carState.hdg)*v*dt;
    carState.wz+=Math.cos(carState.hdg)*v*dt;
    if(PLAYER.bumpX||PLAYER.bumpZ){
      carState.wx+=PLAYER.bumpX*dt; carState.wz+=PLAYER.bumpZ*dt;
      const k=Math.pow(0.02,dt/0.30); PLAYER.bumpX*=k; PLAYER.bumpZ*=k;
    }
    const t=api.barrCheck(dt);
    if(t&&touched<0) touched=f;
    if(touched>=0){
      if(carState.speed*3.6 < 5){ run0++; frozen=Math.max(frozen,run0); } else run0=0;
      if(f-touched<=12) trace.push((carState.speed*3.6).toFixed(0));
    }
  }
  const stop=frozen/60;
  console.log(('  '+deg+' deg at '+kph+' kph').padEnd(24)
    +'kph over the 0.2 s after contact: '+trace.slice(0,8).join(' -> ')
    +'   longest spell under 5 kph: '+stop.toFixed(2)+' s');
  return stop;
}
console.log('driving into a wall, speed in kph frame by frame from the moment of contact:');
const a=run(10,200), b=run(45,200), c=run(90,200), d=run(90,300);
const fails=[];
for(const [n,x] of [['10 deg',a],['45 deg',b],['90 deg',c],['90 deg @300',d]])
  if(x>0.05) fails.push(n+': car sat under 5 kph for '+x.toFixed(2)+' s - that is the freeze');
console.log(fails.length?'\nFAIL:\n  '+fails.join('\n  ')
  :'\nPASS - speed falls away over frames; the car never stops dead on contact');
process.exit(fails.length?1:0);
