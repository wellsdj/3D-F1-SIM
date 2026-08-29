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
const {barrBlocked}=api;
const C=JSON.parse(fs.readFileSync(SD+'/centre.json','utf8'));
const i0=6993;
console.log('driving off the main straight to the RIGHT (the pit side):');
console.log('  only the OPENINGS are listed (nothing within 20 m to the right):');
let open=0, tested=0;
for(let k=-260;k<=340;k+=4){
  const i=((i0+k)%C.length+C.length)%C.length;
  const j=(i+1)%C.length;
  const tx=C[j][0]-C[i][0], tz=C[j][1]-C[i][1];
  const tl=Math.hypot(tx,tz)||1;
  const nx=tz/tl, nz=-tx/tl;             // to the right of travel
  const h=Math.atan2(nx,nz);
  let got=null;
  for(let d=0; d<=60; d+=0.25){
    if(barrBlocked(C[i][0]+nx*d, C[i][1]+nz*d, h)){ got=d; break; }
  }
  tested++;
  if(got===null){ open++; }
  if(got===null||got>20) console.log('  %s   (%s, %s)   %s', String(k).padStart(5),
    C[i][0].toFixed(0).padStart(6), C[i][1].toFixed(0).padStart(7),
    got===null?'NOTHING within 60 m':('open to '+got.toFixed(1)+' m'));
}
console.log('\n  %d of %d points along the straight let the car drive 60 m off to the right',
            open, tested);
