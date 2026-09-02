const fs=require('fs'),SD=__dirname;
global.WALLS=[[{x:-400,z:6},{x:400,z:6}]];
global.SURF={data:new Uint8Array(1),count:0,w:1,h:1,minx:0,minz:0};
global.surfIdx=()=>-1;
global.CARPTS=[{x:0.8,z:1.8},{x:-0.8,z:1.8},{x:0.8,z:-1.8},{x:-0.8,z:-1.8}];
global.clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
global.carGroup={position:{y:0}}; global.document={getElementById:()=>null};
global.spawnSparks=()=>1; global.hitBarrier=null; global.ttVoid=null;
global.wallsReady=true; global.wallsInit=()=>{}; global.BARR={data:new Uint8Array(1),count:1};
const seg=eval('(function(){'+fs.readFileSync(SD+'/seg.js','utf8')+
  '; return {wallsIndexBuild,barrBlocked,segsAround,SEG};})()');
global.segsAround=seg.segsAround; global.SEG=seg.SEG; global.barrBlocked=seg.barrBlocked;
seg.wallsIndexBuild(null);
/* the real shared physics, straight out of the page */
/* These live above the slice in the page, so they are supplied here at the
   values the page uses. */
global.BARR_SHUNT_COS=0.5; global.BARR_MAX_TOUCH=0.10;
global.BARR_TURN_TAU=0.11; global.BARR_BLEED_TAU=0.20;
global.BARR_DMG_MAX=22; global.BARR_DMG_PER=0.16;
const shared=eval('(function(){'+fs.readFileSync(SD+'/barr.js','utf8')
  +';return {wallBounce,barrNormal};})()');
Object.assign(global,shared);
const ai=eval('(function(){'+fs.readFileSync(SD+'/aiwall.js','utf8')+';return {aiWall};})()');

function drive(deg, kph, useWalls){
  const h=(90-deg)*Math.PI/180;
  const C={st:{wx:-60,wz:2.0,hdg:h,speed:kph/3.6}, bumpX:0, bumpZ:0};
  const dt=1/60; let touched=0, through=false, minZ=C.st.wz, worstStall=0, stall=0;
  for(let f=0;f<600;f++){
    const v=C.st.speed;
    C.st.wx+=Math.sin(C.st.hdg)*v*dt; C.st.wz+=Math.cos(C.st.hdg)*v*dt;
    if(C.bumpX||C.bumpZ){
      C.st.wx+=C.bumpX*dt; C.st.wz+=C.bumpZ*dt;
      const k=Math.pow(0.02,dt/0.30); C.bumpX*=k; C.bumpZ*=k;
    }
    if(useWalls && ai.aiWall(C,dt)) touched++;
    if(C.st.wz>6.9) through=true;                  // past the face of the wall
    if(C.st.speed*3.6<5){stall++; worstStall=Math.max(worstStall,stall);} else stall=0;
    C.st.speed=Math.max(C.st.speed, kph/3.6*0.35); // a driver still on the throttle
  }
  return {through, touched, endZ:C.st.wz, stall:worstStall/60, kph:C.st.speed*3.6};
}
console.log('a rival car driven at a wall lying along z = +6:\n');
console.log('  with the collision OFF (what it did before):');
for(const d of [20,90]){ const r=drive(d,200,false);
  console.log('    '+String(d).padStart(2)+' deg -> ended at z='+r.endZ.toFixed(0)
    +(r.through?'   DROVE STRAIGHT THROUGH':'')); }
console.log('\n  with the collision ON:');
const res=[];
for(const d of [10,20,45,90]){ const r=drive(d,200,true); res.push([d,r]);
  console.log('    '+String(d).padStart(2)+' deg -> '+String(r.touched).padStart(3)+' contacts, '
    +'ended at z='+r.endZ.toFixed(1)+', '+r.kph.toFixed(0)+' kph'
    +(r.through?'   WENT THROUGH':'')+(r.stall>0.5?'   STALLED '+r.stall.toFixed(1)+'s':'')); }
const fails=[];
for(const [d,r] of res){
  if(r.through) fails.push(d+' deg: the rival passed through the wall');
  if(!r.touched) fails.push(d+' deg: the rival never registered a contact');
  if(r.stall>0.5) fails.push(d+' deg: the rival sat still for '+r.stall.toFixed(1)+' s');
}
console.log(fails.length?'\nFAIL:\n  '+fails.join('\n  ')
  :'\nPASS - rivals are stopped by walls, bounce off them, and never stick');
process.exit(fails.length?1:0);
