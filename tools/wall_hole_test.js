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
const api=eval('(function(){'+fs.readFileSync(SD+'/seg.js','utf8')+
  '; return {wallsIndexBuild,barrBlocked,segsAround,SEG};})()');
const nearRoad=(x,z)=>{const C=2,C2=C*C;
  for(let b=-C;b<=C;b++)for(let a=-C;a<=C;a++){if(a*a+b*b>C2)continue;
    const k=surfIdx(x+a,z+b); if(k>=0&&SURF.data[k])return true;} return false;};
api.wallsIndexBuild(nearRoad);
const {barrBlocked,SEG}=api;
console.log('live segments: %d', SEG.n);

/* Which walls were KEPT. A line dropped whole by the clearance rule is not a
   hole -- it is a mis-trace being removed on purpose -- so probing it would
   report the rule working as the fault it prevents. Same 60% test the game
   uses. */
const KEPT=global.WALLS.filter(line=>{
  let inside=0,total=0;
  for(let i=0;i+1<line.length;i++){
    const ax=line[i].x,az=line[i].z,bx=line[i+1].x,bz=line[i+1].z;
    const d=Math.hypot(bx-ax,bz-az); if(d<1e-4) continue;
    const parts=Math.max(1,Math.ceil(d/4));
    for(let q=0;q<parts;q++){
      const t=(q+0.5)/parts; total++;
      if(nearRoad(ax+(bx-ax)*t, az+(bz-az)*t)) inside++;
    }
  }
  return !(total && inside/total>0.6);
});
console.log('walls kept: %d of %d', KEPT.length, global.WALLS.length);

/* Walk the length of every kept wall and try to drive the car THROUGH it at
   each metre. A wall with a hole lets the car cross somewhere along its run. */
function crossesAt(mx,mz,nx,nz){
  const h=Math.atan2(nx,nz);
  for(let d=-3;d<=3;d+=0.25) if(barrBlocked(mx+nx*d,mz+nz*d,h)) return false;
  return true;      // never blocked anywhere across it: a hole
}
let holes=[], checked=0;
for(const line of KEPT){
  for(let i=0;i+1<line.length;i++){
    const ax=line[i].x,az=line[i].z,bx=line[i+1].x,bz=line[i+1].z;
    const L=Math.hypot(bx-ax,bz-az); if(L<1e-4) continue;
    const ux=(bx-ax)/L, uz=(bz-az)/L, nx=uz, nz=-ux;
    for(let d=0.5; d<L; d+=1.0){
      const mx=ax+ux*d, mz=az+uz*d;
      if(nearRoad(mx,mz)) continue;           // this wall may legitimately be gone
      checked++;
      if(crossesAt(mx,mz,nx,nz)) holes.push([mx,mz]);
    }
  }
}
console.log('%d points along kept walls probed, %d let the car straight through', checked, holes.length);

/* And the wall in the screenshot: the pit straight, right-hand side. */
console.log('\nthe pit-straight wall specifically:');
let near=0, gap=0;
for(const line of KEPT){
  for(let i=0;i+1<line.length;i++){
    const ax=line[i].x,az=line[i].z;
    if(Math.hypot(ax-0,az-0)>420) continue;   // around the start/finish
    const bx=line[i+1].x,bz=line[i+1].z;
    const L=Math.hypot(bx-ax,bz-az); if(L<1e-4) continue;
    const ux=(bx-ax)/L,uz=(bz-az)/L,nx=uz,nz=-ux;
    for(let d=0.5; d<L; d+=1.0){
      const mx=ax+ux*d, mz=az+uz*d;
      if(nearRoad(mx,mz)) continue;
      near++;
      if(crossesAt(mx,mz,nx,nz)) gap++;
    }
  }
}
console.log('  %d points on walls within 420 m of the start line, %d are holes', near, gap);
const fails=[];
if(holes.length) fails.push(`${holes.length} places where a kept wall can be driven through, e.g. (${holes[0][0].toFixed(0)}, ${holes[0][1].toFixed(0)})`);
console.log(fails.length?'\nFAIL:\n  '+fails.join('\n  '):
  '\nPASS - every wall that is kept is solid along its whole length');
process.exit(fails.length?1:0);
