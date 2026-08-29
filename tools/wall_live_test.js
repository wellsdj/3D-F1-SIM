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
const BARR_CLEAR=0.5;
const nearRoad=(x,z)=>{const C=BARR_CLEAR,C2=C*C,CI=Math.ceil(C);
  for(let b=-CI;b<=CI;b++)for(let a=-CI;a<=CI;a++){if(a*a+b*b>C2)continue;
    const k=surfIdx(x+a,z+b); if(k>=0&&SURF.data[k])return true;} return false;};
api.wallsIndexBuild(nearRoad);
console.log('live segments: %d', api.SEG.n);
// is the new 524 m wall solid along its length?
const nw=global.WALLS[global.WALLS.length-1];
let solid=0, tot=0;
for(let i=0;i+1<nw.length;i++){
  const ax=nw[i].x,az=nw[i].z,bx=nw[i+1].x,bz=nw[i+1].z;
  const L=Math.hypot(bx-ax,bz-az), ux=(bx-ax)/L, uz=(bz-az)/L, nx=uz, nz=-ux;
  const h=Math.atan2(nx,nz);
  for(let d=0.5;d<L;d+=2){
    const mx=ax+ux*d, mz=az+uz*d;
    tot++;
    let blocked=false;
    for(let o=-3;o<=3;o+=0.25) if(api.barrBlocked(mx+nx*o,mz+nz*o,h)){blocked=true;break;}
    if(blocked) solid++;
  }
}
console.log('your new wall: solid at %d of %d points along it (%.0f%%)', solid, tot, 100*solid/tot);
console.log(solid===tot ? '\nPASS - the wall you drew is live along its whole length'
                        : '\nFAIL - part of the wall you drew is not solid');
process.exit(solid===tot?0:1);
