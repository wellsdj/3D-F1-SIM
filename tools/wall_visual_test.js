const fs=require('fs'),SD=__dirname;
const walls=JSON.parse(fs.readFileSync(SD+'/walls.json','utf8'));
const sd=JSON.parse(fs.readFileSync(SD+'/surf.json','utf8'));
const SW=sd.w,SH=sd.h,SX=sd.x,SZ=sd.z, SDa=new Uint8Array(SW*SH);
{let k=0,cur=0; for(const t of sd.r.split('.')){const n=parseInt(t,36)||0;
  if(cur){for(let i=0;i<n&&k<SDa.length;i++,k++)SDa[k]=1;} else k+=n; cur=1-cur;}}
const surfIdx=(x,z)=>{const i=(x-SX)|0,j=(z-SZ)|0;return(i<0||j<0||i>=SW||j>=SH)?-1:j*SW+i;};
const W=walls.map(l=>{const o=[];for(let i=0;i<l.length-1;i+=2)o.push({x:l[i],z:l[i+1]});return o;});

/* the on-road rule, exactly as the page runs it */
const bad=new Set();
for(let li=0;li<W.length;li++){
  const line=W[li]; let on=0,tot=0;
  for(let i=0;i+1<line.length;i++){
    const ax=line[i].x,az=line[i].z,bx=line[i+1].x,bz=line[i+1].z;
    const L=Math.hypot(bx-ax,bz-az), n=Math.max(1,Math.round(L/2));
    for(let q=0;q<=n;q++){const t=q/n,k=surfIdx(ax+(bx-ax)*t,az+(bz-az)*t);
      tot++; if(k>=0&&SDa[k])on++;}
  }
  if(tot&&on/tot>0.25) bad.add(li);
}
const len=l=>{let t=0;for(let i=0;i+1<l.length;i++)t+=Math.hypot(l[i+1].x-l[i].x,l[i+1].z-l[i].z);return t;};
let badM=0; for(const i of bad) badM+=len(W[i]);
console.log('walls flagged as standing on the road: '+bad.size+' of '+W.length
            +'  ('+badM.toFixed(0)+' m)');

/* the handle cull, at three zooms, over a 1200x800 view centred on the circuit */
let minx=1e9,maxx=-1e9,minz=1e9,maxz=-1e9;
for(const l of W) for(const p of l){
  if(p.x<minx)minx=p.x; if(p.x>maxx)maxx=p.x;
  if(p.z<minz)minz=p.z; if(p.z>maxz)maxz=p.z;
}
const cx=(minx+maxx)/2, cz=(minz+maxz)/2, VW=1200, VH=800;
const total=W.reduce((a,l)=>a+l.length,0);
console.log('\n'+total+' points in the set. Handles actually drawn on a '+VW+'x'+VH+' view:');
for(const sc of [0.3, 0.55, 1.2, 3.0]){
  const sx=x=>(x-cx)*sc+VW/2, sy=z=>(z-cz)*sc+VH/2;
  let drawn=0, onscreen=0;
  for(const line of W){
    let lx=-1e9,ly=-1e9;
    for(const p of line){
      const x=sx(p.x), y=sy(p.z);
      if(x<-20||y<-20||x>VW+20||y>VH+20) continue;
      onscreen++;
      const dx=x-lx, dy=y-ly;
      if(dx*dx+dy*dy<36) continue;
      lx=x; ly=y; drawn++;
    }
  }
  const side=sc>0.55?6:4;                 // 2*r, matching the page
  const cover=(drawn*side*side)/(VW*VH)*100;
  console.log('  zoom '+sc.toFixed(2).padStart(5)
    +'   '+String(onscreen).padStart(6)+' on screen -> '+String(drawn).padStart(5)+' drawn'
    +'   '+cover.toFixed(1).padStart(5)+'% of the view is handle'
    +(sc<0.55?'   <- was BLANK before':''));
}
