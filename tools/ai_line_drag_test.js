/* The drag's falloff: does moving one handle give a line a car could drive? */
const N=740, DS=1.0, REACH=40;
const adj=new Float64Array(N);
const base=new Float64Array(N);
const i=300, a=3.0;                       // move station 300 three metres right
/* the reach the page now works out, from the speed there and the size of the
   drag -- tested at three speeds */
const A_LAT=30;
const speed=parseFloat(process.argv[2]||'70');
const need=Math.PI*speed*Math.sqrt(Math.abs(a)/(2*A_LAT));
const reach=Math.round(Math.max(REACH,need)/DS);
for(let d=-reach;d<=reach;d++){
  const q=((i+d)%N+N)%N;
  const w=0.5*(1+Math.cos(Math.PI*d/reach));
  adj[q]=(base[q]||0)*(1-w)+a*w;
}
let peak=0, edge=0, worstStep=0, worstCurv=0;
for(let q=0;q<N;q++) peak=Math.max(peak,adj[q]);
edge=Math.max(Math.abs(adj[(i-reach+N)%N]), Math.abs(adj[(i+reach)%N]));
for(let q=1;q<N;q++){
  worstStep=Math.max(worstStep, Math.abs(adj[q]-adj[q-1]));
  const c=Math.abs(adj[(q+1)%N]-2*adj[q]+adj[q-1]);   // second difference
  worstCurv=Math.max(worstCurv,c);
}
/* Second difference over ds^2 is the curvature the offset adds. A car doing
   70 m/s pulling 30 m/s2 can hold 1/k = v^2/a = 163 m, so k = 0.0061. */
const kAdded=worstCurv/(DS*DS);
console.log('dragging one handle 3.00 m sideways at '+(speed*3.6).toFixed(0)+' kph:');
console.log('  reach chosen           '+reach+' m\n');
console.log('  peak offset            '+peak.toFixed(3)+' m   (asked for '+a.toFixed(2)+')');
console.log('  offset at the edges    '+edge.toFixed(4)+' m   (must be ~0 or the line kinks)');
console.log('  biggest step per metre '+worstStep.toFixed(4)+' m');
console.log('  curvature added        '+kAdded.toFixed(5)+' 1/m');
const kAllow=A_LAT/(speed*speed);
console.log('  the car can hold       '+kAllow.toFixed(5)+' 1/m  (R='+(1/kAllow).toFixed(0)+' m)');
const fails=[];
if(Math.abs(peak-a)>1e-6) fails.push('the handle did not reach where it was dragged');
if(edge>1e-6) fails.push('the offset does not fall to zero at the edge of its reach');
if(kAdded>kAllow*1.02) fails.push('the bend added is tighter than the car can hold');
console.log(fails.length?'\nFAIL:\n  '+fails.join('\n  ')
 :'\nPASS - reaches the drag exactly, fades to nothing at the edges, and the\n'
 +'       bend it adds is well inside what the car can hold');
process.exit(fails.length?1:0);
