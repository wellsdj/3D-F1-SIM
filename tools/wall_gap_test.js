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
global.segsAround=api.segsAround; global.SEG=api.SEG;
const nearRoad=(x,z)=>{const C=2,C2=C*C;
  for(let b=-C;b<=C;b++)for(let a=-C;a<=C;a++){if(a*a+b*b>C2)continue;
    const k=surfIdx(x+a,z+b); if(k>=0&&SURF.data[k])return true;} return false;};
api.wallsIndexBuild(nearRoad);

/* Stand in for the game's tlSt: the stations come off the mesh at load, so
   here they are built from the centreline and the painted edges instead. Same
   shape -- x, z, a unit normal, and the road's half width each side. */
const C=JSON.parse(fs.readFileSync(SD+'/centre.json','utf8'));
global.TL_STEP=4;
const painted=(x,z)=>{const k=surfIdx(x,z); return k>=0&&SURF.data[k]===1;};
global.tlSt=[];
for(let i=0;i<C.length;i+=TL_STEP){
  const j=(i+1)%C.length;
  const tx=C[j][0]-C[i][0], tz=C[j][1]-C[i][1], tl=Math.hypot(tx,tz)||1;
  const rx=tz/tl, rz=-tx/tl;
  let dR=0,dL=0;
  for(let d=0;d<25;d+=0.5){ if(!painted(C[i][0]+rx*d, C[i][1]+rz*d)){ dR=d; break; } }
  for(let d=0;d<25;d+=0.5){ if(!painted(C[i][0]-rx*d, C[i][1]-rz*d)){ dL=d; break; } }
  tlSt.push({x:C[i][0], z:C[i][1], rx, rz, dR:dR||5, dL:dL||5});
}
const gapsApi=eval('(function(){'+fs.readFileSync(SD+'/gaps.js','utf8')+
  '; return {wallsGaps, GAP_REACH, GAP_MIN};})()');
const runs=gapsApi.wallsGaps(true);
let m=0; for(const r of runs) m+=r.length*TL_STEP;
console.log('stations: %d', tlSt.length);
console.log('gap runs of %d m or more with no wall within %d m: %d, covering %d m',
            gapsApi.GAP_MIN, gapsApi.GAP_REACH, runs.length, m);
runs.sort((a,b)=>b.length-a.length);
console.log('\nthe ten longest, where drawing would do the most good:');
for(const r of runs.slice(0,10)){
  const mid=r[Math.floor(r.length/2)];
  console.log('  %s m  around (%s, %s)', String(r.length*TL_STEP).padStart(4),
              mid.x.toFixed(0).padStart(7), mid.z.toFixed(0).padStart(8));
}
const fails=[];
if(!runs.length) fails.push('found no gaps at all, which cannot be right');
if(m>11000) fails.push(`reports ${m} m of gap, more than the lap is long`);
console.log(fails.length?'\nFAIL:\n  '+fails.join('\n  '):
  '\nPASS - the gap finder returns drawable stretches, longest first');
process.exit(fails.length?1:0);
