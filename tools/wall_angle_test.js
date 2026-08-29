const fs=require('fs'),SD=__dirname;
const walls=JSON.parse(fs.readFileSync(SD+'/walls.json','utf8'));
const surfd=JSON.parse(fs.readFileSync(SD+'/surf.json','utf8'));
const SW=surfd.w,SH=surfd.h,SX=surfd.x,SZ=surfd.z;
const SDa=new Uint8Array(SW*SH);
{let k=0,cur=0; for(const t of surfd.r.split('.')){const n=parseInt(t,36)||0;
  if(cur){for(let i=0;i<n&&k<SDa.length;i++,k++)SDa[k]=1;} else k+=n; cur=1-cur;}}
global.SURF={data:SDa,count:1,w:SW,h:SH,minx:SX,minz:SZ};
global.surfIdx=(x,z)=>{const i=(x-SX)|0,j=(z-SZ)|0;return (i<0||j<0||i>=SW||j>=SH)?-1:j*SW+i;};
global.WALLS=walls.map(l=>{const o=[];for(let i=0;i<l.length-1;i+=2)o.push({x:l[i],z:l[i+1]});return o;});
global.CARPTS=[{x:0.8,z:1.8},{x:-0.8,z:1.8},{x:0.8,z:-1.8},{x:-0.8,z:-1.8}];
global.clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
global.carGroup={position:{y:0}}; global.document={getElementById:()=>null};
global.spawnSparks=()=>1; global.hitBarrier=null; global.ttVoid=null;
global.wallsReady=true; global.wallsInit=()=>{};
global.BARR={data:new Uint8Array(1),count:1};
global.BARR_SHUNT_COS=0.5; global.BARR_DMG_MAX=22; global.BARR_DMG_PER=0.16;
global.BARR_BLEED_TAU=0.20; global.BARR_TURN_TAU=0.11;
global.BARR_STEEP_N=5; global.BARR_STEEP_SURE=0.85;
const segapi=eval('(function(){'+fs.readFileSync(SD+'/seg.js','utf8')+
  '; return {wallsIndexBuild,barrBlocked,segsAround,SEG};})()');
global.segsAround=segapi.segsAround; global.SEG=segapi.SEG;
global.barrBlocked=segapi.barrBlocked;
const nearRoad=(x,z)=>{const C=2,C2=C*C;
  for(let b=-C;b<=C;b++)for(let a=-C;a<=C;a++){if(a*a+b*b>C2)continue;
    const k=surfIdx(x+a,z+b); if(k>=0&&SURF.data[k])return true;} return false;};
segapi.wallsIndexBuild(nearRoad);

// drive 40 m alongside each wall run, 0.95 m off the face, and see what happens
const runs=[];
for(const line of global.WALLS){
  for(let i=0;i<line.length;i++){
    let j=i, run=0;
    while(j+1<line.length && run<40){ run+=Math.hypot(line[j+1].x-line[j].x,line[j+1].z-line[j].z); j++; }
    if(run<25) continue;
    const dx=line[j].x-line[i].x, dz=line[j].z-line[i].z, L=Math.hypot(dx,dz);
    if(L<20) continue;
    runs.push({x:line[i].x, z:line[i].z, fx:dx/L, fz:dz/L, len:L});
    i=j;
  }
}
console.log('driving 0.95 m alongside %d wall runs of 20 m or more, at 300 kph', runs.length);
const src=fs.readFileSync(SD+'/barr.js','utf8');
let stopped=0, touchedRuns=0, lost=[]; const stoppedRuns=[];
for(const r of runs){
  const nx=r.fz, nz=-r.fx;
  global.carState={wx:r.x+r.fx*3+nx*0.95, wz:r.z+r.fz*3+nz*0.95,
                   hdg:Math.atan2(r.fx,r.fz), speed:83};
  global.PLAYER={bumpX:0,bumpZ:0,carVY:0};
  Object.assign(global,{BARR_HIT:0,BARR_LURCH:0,BARR_SHAKE:0,BARR_SPARK:0,
                        BARR_DMG:0,BARR_BLEED:0,BARR_TURN:0,BARR_STEEP:0});
  const api=eval('(function(){'+src+';return {barrCheck};})()');
  const dt=1/60; let touched=false; const v0=83;
  for(let f=0;f<Math.ceil(r.len/(83*dt));f++){
    const v=carState.speed;
    carState.wx+=Math.sin(carState.hdg)*v*dt; carState.wz+=Math.cos(carState.hdg)*v*dt;
    if(PLAYER.bumpX||PLAYER.bumpZ){
      carState.wx+=PLAYER.bumpX*dt; carState.wz+=PLAYER.bumpZ*dt;
      const k=Math.pow(0.02,dt/0.30); PLAYER.bumpX*=k; PLAYER.bumpZ*=k;
    }
    if(api.barrCheck(dt)) touched=true;
    if(carState.speed<1){ stopped++; break; }
  }
  if(touched){ touchedRuns++; lost.push(1-carState.speed/v0); }
  if(carState.speed<1) stoppedRuns.push(r);
}
lost.sort((a,b)=>a-b);
const pc=p=>lost.length?(100*lost[Math.min(lost.length-1,Math.floor(lost.length*p))]).toFixed(1):'0';
console.log('  runs where the car touched the wall: %d', touchedRuns);
console.log('  runs where it was STOPPED DEAD: %d (%s%%)', stopped, (100*stopped/runs.length).toFixed(1));
console.log('  speed lost while brushing along: median %s%%, 90th %s%%', pc(0.5), pc(0.9));
/* Is a stop legitimate? The run is a straight 40 m chord along a wall, but the
   wall itself may bulge toward it. If it does, the car really did drive into
   the barrier and stopping is correct -- so the deviation of the wall from the
   chord is measured for every run that stopped. */
function bulge(r){
  let worst=0;
  for(const line of global.WALLS){
    for(const p of line){
      const dx=p.x-r.x, dz=p.z-r.z;
      const along=dx*r.fx+dz*r.fz;
      if(along<0||along>r.len) continue;
      const off=dx*r.fz-dz*r.fx;         // signed, + is the side the car is on
      if(off>0.2 && off<6) worst=Math.max(worst, off);
    }
  }
  return worst;
}
const bulges=stoppedRuns.map(bulge).sort((a,b)=>a-b);
if(bulges.length){
  const real=bulges.filter(b=>b>1.2).length;
  console.log('  of the %d that stopped, %d are walls that bulge over 1.2 m into the',
              bulges.length, real);
  console.log('  car\'s path -- it really did drive into them. %d are not.',
              bulges.length-real);
  console.log('  spurious stops: %s%% of all runs', (100*(bulges.length-real)/runs.length).toFixed(1));
}
const fails=[];
const spurious=bulges.filter(b=>b<=1.2).length;
if(100*spurious/runs.length>2.5)
  fails.push(`${(100*spurious/runs.length).toFixed(1)}% of parallel runs stopped for no reason in the wall's shape`);
console.log(fails.length?'\nFAIL:\n  '+fails.join('\n  '):
  '\nPASS - running alongside a wall does not stop the car');
process.exit(fails.length?1:0);
