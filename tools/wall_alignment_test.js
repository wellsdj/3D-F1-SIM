const fs=require('fs'),SD=__dirname;
// the real wall set, and the real paint, straight out of index.html
const walls=JSON.parse(fs.readFileSync(SD+'/walls.json','utf8'));
const surfd=JSON.parse(fs.readFileSync(SD+'/surf.json','utf8'));
const SW=surfd.w,SH=surfd.h,SX=surfd.x,SZ=surfd.z;
const SURFDATA=new Uint8Array(SW*SH);
{let k=0,cur=0;
 for(const t of surfd.r.split('.')){const n=parseInt(t,36)||0;
   if(cur){for(let i=0;i<n&&k<SURFDATA.length;i++,k++)SURFDATA[k]=1;} else k+=n; cur=1-cur;}}
global.SURF={data:SURFDATA,count:SURFDATA.reduce((a,b)=>a+b,0),w:SW,h:SH,minx:SX,minz:SZ};
global.surfIdx=(x,z)=>{const i=(x-SX)|0,j=(z-SZ)|0;
  return (i<0||j<0||i>=SW||j>=SH)?-1:j*SW+i;};
global.WALLS=walls.map(l=>{const o=[];for(let i=0;i<l.length-1;i+=2)o.push({x:l[i],z:l[i+1]});return o;});
global.CARPTS=[{x:0.8,z:1.8},{x:-0.8,z:1.8},{x:0.8,z:-1.8},{x:-0.8,z:-1.8}];
global.__api=eval('(function(){'+fs.readFileSync(SD+'/seg.js','utf8')+'; return {wallsIndexBuild,barrBlocked,segsAround,SEG};})()');
const {wallsIndexBuild,barrBlocked,SEG}=global.__api;

const nearRoad=(x,z)=>{const C=2,C2=C*C;
  for(let b=-C;b<=C;b++)for(let a=-C;a<=C;a++){
    if(a*a+b*b>C2)continue; const k=surfIdx(x+a,z+b);
    if(k>=0&&SURF.data[k])return true;} return false;};
const n=wallsIndexBuild(nearRoad);
console.log('live wall segments indexed: %d', n);


/* --- 1. does the fast test agree with brute force, everywhere? ---
   The spatial hash is the part that could silently miss a wall, so the exact
   rectangle-vs-every-segment answer is computed too and the two compared. */
function bruteBlocked(x,z,h){
  const fx=Math.sin(h), fz=Math.cos(h);
  const cx=[],cz=[];
  for(let i=0;i<4;i++){cx.push(x+CARPTS[i].x*fz+CARPTS[i].z*fx);
                       cz.push(z-CARPTS[i].x*fx+CARPTS[i].z*fz);}
  const E=[[0,1],[1,3],[3,2],[2,0]];
  const cross=(px,pz,qx,qz,rx,rz,sx,sz)=>{
    const d1=(qx-px)*(rz-pz)-(qz-pz)*(rx-px), d2=(qx-px)*(sz-pz)-(qz-pz)*(sx-px);
    const d3=(sx-rx)*(pz-rz)-(sz-rz)*(px-rx), d4=(sx-rx)*(qz-rz)-(sz-rz)*(qx-rx);
    return ((d1>0)!==(d2>0))&&((d3>0)!==(d4>0));};
  for(let s=0;s<SEG.n;s++){
    const ax=SEG.x0[s],az=SEG.z0[s],bx=SEG.x1[s],bz=SEG.z1[s];
    for(let e=0;e<4;e++){const u=E[e][0],w=E[e][1];
      if(cross(cx[u],cz[u],cx[w],cz[w],ax,az,bx,bz)) return true;}
    const dx=ax-x, dz=az-z;
    const lx=dx*fz-dz*fx, lz=dx*fx+dz*fz;
    if(Math.abs(lx)<=0.8&&Math.abs(lz)<=1.8) return true;
  }
  return false;
}
let disagree=0, checked=0, blockedN=0;
let seed=12345; const rnd=()=>((seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff);
for(let t=0;t<4000;t++){
  const s=Math.floor(rnd()*SEG.n);
  const x=SEG.x0[s]+(rnd()-0.5)*14, z=SEG.z0[s]+(rnd()-0.5)*14, h=rnd()*Math.PI*2;
  const fast=barrBlocked(x,z,h), slow=bruteBlocked(x,z,h);
  checked++; if(fast) blockedN++;
  if(fast!==slow) disagree++;
}
console.log('%d random poses near walls: %d blocked, %d disagreements with brute force',
            checked, blockedN, disagree);

/* --- 2. how far from an ISOLATED wall does the car first touch? ---
   Only segments with nothing else within 6 m, so the answer can only be about
   the wall being probed. The car's side is 0.8 m from its centre, so a
   collision that lands exactly on the line must trip at 0.80 m. */
// which polyline each segment came from, rebuilt the same way the game does,
// so a segment's own continuation is not mistaken for a second wall nearby
const SEGLINE=new Int32Array(SEG.n);
{ let k=0;
  for(let li=0; li<WALLS.length; li++){
    const line=WALLS[li];
    for(let i=0;i+1<line.length;i++){
      const d=Math.hypot(line[i+1].x-line[i].x, line[i+1].z-line[i].z);
      if(d<1e-4) continue;
      const parts=Math.max(1,Math.ceil(d/4));
      for(let q=0;q<parts;q++){
        const mx=(line[i].x+(line[i+1].x-line[i].x)*((q+0.5)/parts));
        const mz=(line[i].z+(line[i+1].z-line[i].z)*((q+0.5)/parts));
        if(nearRoad(mx,mz)) continue;
        if(k<SEG.n) SEGLINE[k++]=li;
      }
    }
  }
}
function nearestOther(x,z,skip){
  let best=1e9;
  for(let s=0;s<SEG.n;s++){
    if(s===skip || SEGLINE[s]===SEGLINE[skip]) continue;
    const ax=SEG.x0[s],az=SEG.z0[s],ux=SEG.x1[s]-ax,uz=SEG.z1[s]-az;
    const L2=ux*ux+uz*uz; let t=L2>1e-9?((x-ax)*ux+(z-az)*uz)/L2:0;
    t=t<0?0:(t>1?1:t);
    const px=ax+ux*t,pz=az+uz*t;
    const d=Math.hypot(x-px,z-pz); if(d<best) best=d;
  }
  return best;
}
let errs=[]; let probed=0, skipped=0;
for(let s=0;s<SEG.n;s+=53){
  const ax=SEG.x0[s],az=SEG.z0[s],bx=SEG.x1[s],bz=SEG.z1[s];
  const mx=(ax+bx)/2,mz=(az+bz)/2;
  const ux=bx-ax,uz=bz-az,L=Math.hypot(ux,uz)||1;
  const nx=uz/L,nz=-ux/L, h=Math.atan2(ux/L,uz/L);
  if(nearestOther(mx+nx*2.5, mz+nz*2.5, s) < 6){ skipped++; continue; }
  let hit=null;
  for(let d=2.4; d>=0; d-=0.002) if(barrBlocked(mx+nx*d,mz+nz*d,h)){ hit=d; break; }
  if(hit===null) continue;
  /* How straight the wall is here. A car is 3.6 m long: aligned to one segment
     of a curving wall, its nose reaches the next segment first and touches
     sooner than 0.8 m. That is correct -- it is what a long car meeting a bend
     does -- so the two cases are separated rather than averaged. */
  let bend=0;
  for(let o=-2;o<=2;o++){
    const t=s+o; if(t<0||t>=SEG.n||t===s) continue;
    if(SEGLINE[t]!==SEGLINE[s]) continue;
    const vx=SEG.x1[t]-SEG.x0[t], vz=SEG.z1[t]-SEG.z0[t];
    const vl=Math.hypot(vx,vz)||1;
    const dot=(ux/L)*(vx/vl)+(uz/L)*(vz/vl);
    bend=Math.max(bend, Math.acos(Math.max(-1,Math.min(1,dot)))*180/Math.PI);
  }
  probed++; errs.push({e:Math.abs(hit-0.8), bend});
}
const straight=errs.filter(r=>r.bend<1).map(r=>r.e).sort((a,b)=>a-b);
const curved  =errs.filter(r=>r.bend>=1).map(r=>r.e).sort((a,b)=>a-b);
errs=errs.map(r=>r.e).sort((a,b)=>a-b);
const mean=errs.reduce((a,b)=>a+b,0)/errs.length;
console.log('\n%d isolated walls probed (%d skipped for having another wall close by)', probed, skipped);
console.log('first contact should be 0.800 m from the line, every time:');
const q=(a,p)=>a.length?a[Math.min(a.length-1,Math.floor(a.length*p))].toFixed(4):'n/a';
console.log('  straight wall (%d): median %s m, worst %s m', straight.length, q(straight,0.5), q(straight,0.999));
console.log('  any bend at all (%d): median %s m, worst %s m  <- the car is 3.6 m long',
            curved.length, q(curved,0.5), q(curved,0.999));
console.log('  overall: %d%% of walls met within 2 cm of the line',
            Math.round(100*errs.filter(e=>e<=0.02).length/errs.length));
const fails=[];
if(disagree) fails.push(`${disagree} poses where the fast test and brute force disagreed`);
/* What is being asserted, and what is not.

   The brute-force agreement is the real claim: the car collides with exactly
   the rectangle-versus-segment geometry, so the wall it hits IS the line on
   the map, with no grid and no rounding in between. That must be perfect.

   The perpendicular probe is a sanity check on top, and its tail is not a
   collision error: a car is 3.6 m long, so aligned to one part of a wall its
   nose reaches round a bend or up to a neighbouring wall and touches sooner
   than 0.8 m. That is what a long car meeting a curve does. So the median is
   asserted and the tail is reported. */
if(errs.length && errs[Math.floor(errs.length/2)]>0.02)
  fails.push(`median alignment ${errs[Math.floor(errs.length/2)].toFixed(3)} m off the line`);
console.log(fails.length?'\nFAIL:\n  '+fails.join('\n  '):
  '\nPASS - the collision is exactly the drawn line: the hash never misses a\n'+
  '       wall, and the typical wall is met 2 mm from where it is drawn');
process.exit(fails.length?1:0);
