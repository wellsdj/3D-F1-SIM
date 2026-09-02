/* The follow cap, old rule vs new, on the geometry that actually occurs at a
   first corner: a bunched field, everybody pushed off the racing line. */
const N=400, DS=1.0, ABREAST=2.6, FOLLOW=60, CAR_LEN=4.6, followK=0.85;
// a gentle arc standing in for the line; only the geometry matters
const X=[],Z=[];
for(let i=0;i<N;i++){ const t=i*DS/120; X.push(Math.sin(t)*120); Z.push(Math.cos(t)*120); }
const norm=q=>{ const r=(q+1)%N, tx=X[r]-X[q], tz=Z[r]-Z[q], tl=Math.hypot(tx,tz)||1;
                return {nx:tz/tl, nz:-tx/tl}; };
const at=(q,lat)=>{ const {nx,nz}=norm(q); return {x:X[q]+nx*lat, z:Z[q]+nz*lat}; };

function cap(i, myLat, rivals, usePath){
  let cap=Infinity;
  for(const r of rivals){
    const p=at(r.i, r.lat);
    let gap=Infinity;
    for(let m=1;m<=Math.round(FOLLOW/DS);m++){
      const q=(i+m)%N;
      const me = usePath ? at(q,myLat) : {x:X[q], z:Z[q]};
      if((me.x-p.x)**2+(me.z-p.z)**2 < ABREAST*ABREAST){ gap=m*DS; break; }
    }
    if(gap===Infinity) continue;
    const room=Math.max(0,gap-CAR_LEN*1.5);
    const allow=Math.sqrt(r.v*r.v+2*46*followK*room);
    if(allow<cap) cap=allow;
  }
  return cap;
}
const kph=v=>v===Infinity?'no cap':(v*3.6).toFixed(0)+' kph';
console.log('a car at 30 m/s (108 kph), and one rival at 25 m/s (90 kph):\n');
const cases=[
 ['rival 20 m ahead, both on the line',            0,   {i:20,lat:0,   v:25}],
 ['rival 20 m ahead, both pushed 3 m wide',        3,   {i:20,lat:3,   v:25}],
 ['rival alongside on the other line, 3 m across', 3,   {i:20,lat:-3,  v:25}],
 ['rival alongside, I am on the line',             0,   {i:20,lat:3,   v:25}],
 ['I am 3 m wide, rival ON the line 3 m across',   3,   {i:20,lat:0,   v:25}],
];
let fails=[];
for(const [name,myLat,r] of cases){
  const o=cap(0,myLat,[r],false), n=cap(0,myLat,[r],true);
  console.log('  '+name.padEnd(42)+' old '+kph(o).padStart(8)+'   new '+kph(n).padStart(8));
  if(name.includes('both pushed') && n===Infinity)
    fails.push('a car directly ahead of me off-line is still not seen');
  if(name.includes('other line') && n!==Infinity)
    fails.push('a car on a different line still caps me');
  if(name.includes('ON the line') && n!==Infinity)
    fails.push('a car three metres across the road still caps me');
}
console.log(fails.length?'\nFAIL:\n  '+fails.join('\n  ')
 :'\nPASS - the cap now follows the car’s own path: it sees who is in front of\n'
 +'       IT, and ignores who is merely near the racing line');
process.exit(fails.length?1:0);
