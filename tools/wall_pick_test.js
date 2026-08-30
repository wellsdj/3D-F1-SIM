const fs=require('fs'),SD=__dirname;
const walls=JSON.parse(fs.readFileSync(SD+'/walls.json','utf8'));
global.WALLS=walls.map(l=>{const o=[];for(let i=0;i<l.length-1;i+=2)o.push({x:l[i],z:l[i+1]});return o;});
// the editor's world->screen, at a typical working zoom
const SC=2.2, OX=500, OY=400;
global.m2sx=x=>x*SC+OX;
global.m2sy=z=>z*SC+OY;
const api=eval('(function(){'+fs.readFileSync(SD+'/pick.js','utf8')+'; return {wallPickAt, WALL_PICK};})()');

/* Click exactly on the middle of a segment of a known wall and check the right
   wall comes back -- including walls with only two points, and walls that run
   close beside another one, which is where a picker gets it wrong. */
let ok=0, wrong=0, missed=0, tested=0;
for(let li=0; li<WALLS.length; li+=37){
  const line=WALLS[li];
  if(line.length<2) continue;
  const i=Math.floor((line.length-1)/2);
  const mx=(line[i].x+line[i+1].x)/2, mz=(line[i].z+line[i+1].z)/2;
  // only test walls that are on screen at this pan/zoom
  const sx=m2sx(mx), sy=m2sy(mz);
  if(sx<-1e5||sx>1e5) continue;
  tested++;
  const got=api.wallPickAt(sx,sy);
  if(got===li) ok++;
  else if(got<0) missed++;
  else {
    // a different wall is only wrong if it is not also right under the pointer
    const other=WALLS[got];
    let near=false;
    for(let k=0;k+1<other.length;k++){
      const ax=m2sx(other[k].x), ay=m2sy(other[k].z);
      const bx=m2sx(other[k+1].x), by=m2sy(other[k+1].z);
      const ux=bx-ax, uy=by-ay, L2=ux*ux+uy*uy;
      let t=L2>1e-9?((sx-ax)*ux+(sy-ay)*uy)/L2:0; t=t<0?0:(t>1?1:t);
      const dx=sx-(ax+ux*t), dy=sy-(ay+uy*t);
      if(dx*dx+dy*dy<=api.WALL_PICK*api.WALL_PICK) near=true;
    }
    if(near) ok++; else wrong++;
  }
}
console.log('clicked the middle of %d walls:', tested);
console.log('  picked that wall (or one genuinely under the pointer): %d', ok);
console.log('  picked nothing:                                        %d', missed);
console.log('  picked a wall that is not under the pointer:           %d', wrong);

// clicking well away from anything must pick nothing
let falsePos=0, empty=0;
let seed=7; const rnd=()=>((seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff);
for(let t=0;t<3000;t++){
  const x=rnd()*4000-1000, y=rnd()*4000-1000;
  // is anything actually within the pick radius?
  let near=false;
  for(const line of WALLS){
    for(let k=0;k+1<line.length;k++){
      const ax=m2sx(line[k].x), ay=m2sy(line[k].z);
      const bx=m2sx(line[k+1].x), by=m2sy(line[k+1].z);
      const ux=bx-ax,uy=by-ay,L2=ux*ux+uy*uy;
      let u=L2>1e-9?((x-ax)*ux+(y-ay)*uy)/L2:0; u=u<0?0:(u>1?1:u);
      const dx=x-(ax+ux*u), dy=y-(ay+uy*u);
      if(dx*dx+dy*dy<=api.WALL_PICK*api.WALL_PICK){ near=true; break; }
    }
    if(near) break;
  }
  if(!near){ empty++; if(api.wallPickAt(x,y)>=0) falsePos++; }
}
console.log('\n%d clicks on empty space, %d wrongly picked a wall', empty, falsePos);
const fails=[];
if(missed) fails.push(`${missed} clicks straight on a wall picked nothing`);
if(wrong)  fails.push(`${wrong} clicks picked a wall that was not under the pointer`);
if(falsePos) fails.push(`${falsePos} clicks on empty space picked a wall - drawing would be blocked`);
console.log(fails.length?'\nFAIL:\n  '+fails.join('\n  '):
  '\nPASS - clicking a wall picks that wall, clicking empty space picks nothing');
process.exit(fails.length?1:0);
