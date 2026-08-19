/* --------------------------------------------------------------- racing line
   Two separate things, and keeping them separate is the whole design:

   THE PATH is the shape of the lap -- SPA_LINE, 207 points clicked by hand in
   the running game, drawn as a smoothed curve through them rather than
   straight segment to segment, so the corners are round like a real line and
   not a chain of kinks. The path carries no pedal information at all.

   PEDAL POINTS are sparse markers dropped *on* that path. Each one says how
   much throttle and how much brake from here on, and it holds until the next
   marker says otherwise. Zero and zero is a coast. You can only put one on
   the line -- a click that misses the line does nothing, because a pedal
   instruction that isn't on the path the car drives would mean nothing.

   The line is only drawn while the Racing line tab is open. It is authoring
   scaffolding, not part of the race. */
const PEDAL_COL={ coast:0xdddddd, thr:0x33ff66, brk:0xffbb00 };
const RIBBON_COL={ coast:[0.85,0.85,0.88], thr:[0.20,1.00,0.40], brk:[1.00,0.73,0.00] };
let linePath=[];                 // Vector3 control points -- the shape
let pedalPts=[];                 // {s, thr, brk}, sorted by s along the curve
let pedalSel=-1;
let lineGroup=null, lineDots=[], lineRibbon=null;

/* Centripetal Catmull-Rom, specifically: the uniform form overshoots and
   loops back on itself wherever two control points land close together, and
   clicks bunch up in the slow corners, which is exactly where a loop would
   be worst. Centripetal cannot self-intersect between control points. */
let lineSmooth=[], lineCum=[], lineLen=0, lineClosed=false, lineCurve=null;
const LINE_STEP=2.5;             // metres between samples along the curve
function lineBuildCurve(){
  lineSmooth=[]; lineCum=[]; lineLen=0;
  if(linePath.length<2) return;
  /* Closed, so the lap joins up. It was an open curve, which left the stretch
     between the last point you clicked and the first one as a hole: no ribbon
     to click on, no samples to follow, and a preview that ran out of line at
     the start/finish and stopped. A closed centripetal Catmull-Rom carries
     the curvature across the join like any other part of the lap, so the
     corner there is a corner rather than a kink or a gap.

     A short line is left open -- three or four points are somebody starting
     to draw, not a lap, and closing those would loop the car back on itself. */
  lineClosed = linePath.length>=8;
  const curve=new THREE.CatmullRomCurve3(linePath.map(v=>v.clone()),lineClosed,'centripetal',0.5);
  /* Kept, not just sampled. The samples are 2.5 m apart, so anything reading a
     heading off them gets the direction of the segment it happens to be on --
     a staircase, which is what made the AI jitter: at 300 kph it crosses a
     segment every 30 ms and the whole car snapped round by a fraction of a
     degree each time. The curve itself is continuous, so ask it. The
     arc-length table is refined to about a point every two metres, or its own
     lookup would put a ripple back in at a coarser wavelength. */
  lineCurve=curve;
  curve.arcLengthDivisions=Math.max(200,Math.ceil(curve.getLength()/2));
  curve.updateArcLengths();
  const n=Math.max(2,Math.min(4000,Math.round(curve.getLength()/LINE_STEP)));
  lineSmooth=curve.getSpacedPoints(n);
  // sit every sample on the actual ground -- interpolating height between
  // control points sinks the curve into the road over a crest
  lineSmooth.forEach(v=>{ const g=groundAt(v.x,v.z,v.y); if(g.hit) v.y=g.y; });
  lineCum.push(0);
  for(let i=1;i<lineSmooth.length;i++)
    lineCum.push(lineCum[i-1]+lineSmooth[i].distanceTo(lineSmooth[i-1]));
  lineLen=lineCum[lineCum.length-1]||0;
}
/* Where along the curve a distance falls, and what the pedals are doing
   there. The marker in force is the last one you passed.

   Before the first marker it is the *first* one, not the last one round the
   lap. Wrapping was wrong for the only thing that reads this: a preview
   starts at the beginning of the line, stopped, so the wrap handed it
   whatever the final marker of the lap says -- at Spa the Bus Stop, a brake
   or a part-throttle coast -- and the car crawled off the line under that
   until it reached the first real marker. A car that has actually driven
   round to the end of the lap reads the last marker directly anyway, so the
   wrap was never buying anything. */
function lineAt(s){
  const out={x:0,y:0,z:0,hdg:0};
  if(lineSmooth.length<2) return out;
  s=clamp(s,0,lineLen);
  let lo=0, hi=lineCum.length-1;
  while(lo<hi-1){ const mid=(lo+hi)>>1; if(lineCum[mid]<=s) lo=mid; else hi=mid; }
  const a=lineSmooth[lo], b=lineSmooth[Math.min(lo+1,lineSmooth.length-1)];
  const seg=Math.max(lineCum[lo+1]-lineCum[lo],1e-4), f=clamp((s-lineCum[lo])/seg,0,1);
  out.x=a.x+(b.x-a.x)*f; out.y=a.y+(b.y-a.y)*f; out.z=a.z+(b.z-a.z)*f;
  out.hdg=Math.atan2(b.x-a.x,b.z-a.z);
  return out;
}
const PEDAL_LAUNCH={thr:100,brk:0};
function pedalAt(s, lapped){
  let best=null;
  for(const q of pedalPts){ if(q.s<=s) best=q; else break; }
  if(best) return best;
  /* Nothing has been said yet. On the first lap that means a car being let go
     from a standstill, and a car being let go goes -- flat, until the first
     marker says otherwise. This is what was making it crawl from the moment
     you pressed Preview to the exit of Turn 1: the stretch before the first
     marker was being given that marker's own instruction, and the first
     marker on a lap of Spa is the brake board for La Source. It sat there
     braking down the whole start straight and only came alive once it was
     past the thing. Coming round again it has genuinely passed the last
     marker of the lap, so from the second lap on that is what holds. */
  return lapped ? (pedalPts[pedalPts.length-1]||PEDAL_LAUNCH) : PEDAL_LAUNCH;
}
function pedalSort(){
  const keep=pedalSel>=0?pedalPts[pedalSel]:null;
  pedalPts.sort((a,b)=>a.s-b.s);
  pedalSel=keep?pedalPts.indexOf(keep):-1;
}
function pedalKind(q){ return q.brk>0 ? 'brk' : (q.thr>0 ? 'thr' : 'coast'); }

function lineRedraw(){
  if(lineGroup){ scene.remove(lineGroup);
    lineGroup.traverse(o=>{ if(o.geometry)o.geometry.dispose(); }); }
  lineGroup=new THREE.Group(); scene.add(lineGroup);
  lineDots=[]; lineRibbon=null;
  lineGroup.visible = gridMode && editTab==='line';
  if(!lineSmooth.length) lineBuildCurve();
  /* A ribbon rather than a line: GPU line width is one pixel on nearly every
     browser, so a plain line vanishes at any distance. Two triangles per
     sample, laid flat on the road, coloured by the pedal in force there --
     which is also what makes it clickable, since it is a real mesh. */
  if(lineSmooth.length>1){
    const N=lineSmooth.length, half=1.3;
    const pos=new Float32Array(N*2*3), col=new Float32Array(N*2*3), idx=[];
    for(let i=0;i<N;i++){
      const a=lineSmooth[Math.max(0,i-1)], b=lineSmooth[Math.min(N-1,i+1)];
      let dx=b.x-a.x, dz=b.z-a.z; const L=Math.hypot(dx,dz)||1; dx/=L; dz/=L;
      const px=-dz*half, pz=dx*half, v=lineSmooth[i];
      pos[i*6]=v.x+px; pos[i*6+1]=v.y+0.10; pos[i*6+2]=v.z+pz;
      pos[i*6+3]=v.x-px; pos[i*6+4]=v.y+0.10; pos[i*6+5]=v.z-pz;
      const q=pedalAt(lineCum[i]), kind=pedalKind(q), c=RIBBON_COL[kind];
      // stronger colour the harder the pedal, so a 20% lift reads differently
      // from flat out without needing a number on screen
      const amt = kind==='brk' ? q.brk : (kind==='thr' ? q.thr : 100);
      const k = kind==='coast' ? 1 : (0.45+0.55*amt/100);
      for(let s=0;s<2;s++){ col[i*6+s*3]=c[0]*k; col[i*6+s*3+1]=c[1]*k; col[i*6+s*3+2]=c[2]*k; }
      if(i<N-1){ const o=i*2; idx.push(o,o+1,o+2, o+1,o+3,o+2); }
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(pos,3));
    g.setAttribute('color',new THREE.BufferAttribute(col,3));
    g.setIndex(idx);
    lineRibbon=new THREE.Mesh(g,new THREE.MeshBasicMaterial({
      vertexColors:true,transparent:true,opacity:0.70,side:THREE.DoubleSide,
      depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4}));
    lineRibbon.renderOrder=998;
    lineGroup.add(lineRibbon);
  }
  // the markers: a post standing on the line, tall enough to spot from the
  // car and fat enough to click without hunting for it
  const geo=new THREE.CylinderGeometry(0.85,0.85,4.2,12);
  pedalPts.forEach((q,i)=>{
    const at=lineAt(q.s);
    const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({
      color:PEDAL_COL[pedalKind(q)],depthTest:false}));
    m.position.set(at.x,at.y+2.2,at.z);
    m.renderOrder=999;
    if(i===pedalSel) m.scale.set(1.5,1.15,1.5);
    m.userData.pedalIndex=i;
    lineGroup.add(m); lineDots.push(m);
  });
}
function lineSetVisible(){
  const on = (gridMode && editTab==='line') || pathEdit;
  if(lineGroup) lineGroup.visible = on;
  if(!(gridMode && editTab==='line')) dotMenuClose();
}

/* ------------------------------------------------------- the path, editable
   L puts the shape of the lap in your hands: every control point of the curve
   comes up as a post you can drag along the ground, and a click anywhere else
   on the track adds one. Nothing here deletes -- a point put somewhere daft
   is dragged somewhere sensible, and a lap you can only add to cannot be
   destroyed by a stray click.

   A new point goes into the *segment it was clicked nearest*, never on the
   end. Appending would run the lap out to wherever you clicked and back,
   which is not what anyone means by adding a point to a line.

   The pedal markers are measured in metres along the curve, so moving the
   shape underneath them would slide them up and down the lap. They are
   pinned to the ground instead: where each one stood is remembered before the
   rebuild and it is put back at the nearest point of the new curve, so the
   brake board for a corner stays with that corner. */
let pathEdit=false, pathGroup=null, pathDots=[], pathDrag=-1, pathLastBuild=0,
    pathSel=-1, pathDownX=0, pathDownY=0;
/* Deleting one is the exception to "moving is enough", so it is deliberate:
   click a point to pick it -- it goes white and fat -- and then Undo, or
   Backspace, takes that one out. A click is a pick and a drag is a move, told
   apart by whether the cursor actually went anywhere, so picking one cannot
   nudge it out of place. */
const PATH_MIN=8;                // below this the lap can no longer be closed
function pathDelete(){
  if(!pathEdit||pathSel<0||pathSel>=linePath.length) return;
  if(linePath.length<=PATH_MIN) return;
  const i=pathSel; pathSel=-1;
  pathEditing(()=>{ linePath.splice(i,1); });
}
function pathRedraw(){
  if(pathGroup){ scene.remove(pathGroup);
    pathGroup.traverse(o=>{ if(o.geometry)o.geometry.dispose(); }); }
  pathDots=[]; pathGroup=null;
  if(!pathEdit) return;
  pathGroup=new THREE.Group(); scene.add(pathGroup);
  const geo=new THREE.CylinderGeometry(0.55,0.55,3.0,10);
  linePath.forEach((p,i)=>{
    const picked = (i===pathSel||i===pathDrag);
    const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({
      color: picked?0xffffff:0x33ddff, depthTest:false }));
    m.position.set(p.x,p.y+1.6,p.z);
    m.renderOrder=1000;
    if(picked) m.scale.set(1.6,1.2,1.6);
    m.userData.pathIndex=i;
    pathGroup.add(m); pathDots.push(m);
  });
}
function pickPathDot(clientX,clientY){
  if(!pathDots.length) return -1;
  const r=canvas.getBoundingClientRect();
  _markMouse.x=((clientX-r.left)/r.width)*2-1;
  _markMouse.y=-((clientY-r.top)/r.height)*2+1;
  _markRay.setFromCamera(_markMouse,camera);
  const hit=_markRay.intersectObjects(pathDots,false);
  return hit.length?hit[0].object.userData.pathIndex:-1;
}
/* Where on the curve a world point falls, to the nearest sample. */
function lineNearestS(p){
  let bd=Infinity, bs=0;
  for(let i=0;i<lineSmooth.length;i++){
    const dx=lineSmooth[i].x-p.x, dz=lineSmooth[i].z-p.z, d=dx*dx+dz*dz;
    if(d<bd){ bd=d; bs=lineCum[i]; }
  }
  return bs;
}
/* Change the path, keeping every pedal marker over the piece of road it was
   standing on rather than at the number of metres it happened to be at. */
function pathEditing(change){
  const held=pedalPts.map(q=>{ const a=lineAt(q.s); return {x:a.x,z:a.z}; });
  change();
  lineBuildCurve();
  pedalPts.forEach((q,i)=>{ q.s=lineNearestS(held[i]); });
  pedalSort();
  lineRedraw(); pathRedraw(); lineSetVisible(); updateStatus(); editSave();
}
/* Which pair of control points a click belongs between: the segment whose
   closest approach to the click is nearest, the closing pair included, since
   the lap joins up. */
function pathInsertIndex(p){
  const n=linePath.length, last=lineClosed?n:n-1;
  let bd=Infinity, bi=n;
  for(let i=0;i<last;i++){
    const a=linePath[i], b=linePath[(i+1)%n];
    const ax=b.x-a.x, az=b.z-a.z, L=ax*ax+az*az||1e-9;
    const t=clamp(((p.x-a.x)*ax+(p.z-a.z)*az)/L,0,1);
    const dx=a.x+ax*t-p.x, dz=a.z+az*t-p.z, d=dx*dx+dz*dz;
    if(d<bd){ bd=d; bi=i+1; }
  }
  return bi;
}
function pathShow(on){
  pathEdit=on; pathDrag=-1; pathSel=-1;
  pathRedraw(); lineSetVisible(); updateStatus();
}
/* The path as it would be written in the file: model coordinates, the frame
   spawnAt is in, so the numbers survive a reload. */
function pathText(){
  if(!trackRoot) return '';
  return '['+linePath.map(v=>{ const m=gridToModel(v); return '['+m[0]+','+m[1]+']'; })
                     .join(',\n ')+']';
}
/* A click lands on the line or it does nothing. The ribbon is the test: hit
   it, and the nearest sample to the hit gives the distance along the lap. */
function lineHitS(clientX,clientY){
  if(!lineRibbon||!lineSmooth.length) return -1;
  const r=canvas.getBoundingClientRect();
  _markMouse.x=((clientX-r.left)/r.width)*2-1;
  _markMouse.y=-((clientY-r.top)/r.height)*2+1;
  _markRay.setFromCamera(_markMouse,camera);
  const hit=_markRay.intersectObject(lineRibbon,false);
  if(!hit.length) return -1;
  const p=hit[0].point;
  let bi=0, bd=Infinity;
  for(let i=0;i<lineSmooth.length;i++){
    const d=lineSmooth[i].distanceToSquared(p);
    if(d<bd){ bd=d; bi=i; }
  }
  return lineCum[bi];
}
function pickPedalPost(clientX,clientY){
  if(!lineDots.length) return -1;
  const r=canvas.getBoundingClientRect();
  _markMouse.x=((clientX-r.left)/r.width)*2-1;
  _markMouse.y=-((clientY-r.top)/r.height)*2+1;
  _markRay.setFromCamera(_markMouse,camera);
  const hit=_markRay.intersectObjects(lineDots,false);
  return hit.length?hit[0].object.userData.pedalIndex:-1;
}

/* -------------------------------------------------------------- dot menu
   Opens on the marker you clicked and follows it across the screen, so the
   numbers you are setting stay next to the piece of track they apply to. */
const dm=id=>document.getElementById(id);
function dotMenuClose(){ pedalSel=-1; dm('dotmenu').classList.remove('on'); lineRedraw(); linePanel(); }
function dotMenuOpen(i){ pedalSel=i; dotMenuFill(); dm('dotmenu').classList.add('on'); }
function dotMenuFill(){
  const q=pedalPts[pedalSel]; if(!q) return;
  dm('dmnum').textContent=String(pedalSel+1).padStart(2,'0')+' · '+Math.round(q.s)+' m';
  dm('dmthrval').innerHTML=Math.round(q.thr)+'<small>%</small>';
  dm('dmbrkval').innerHTML=Math.round(q.brk)+'<small>%</small>';
  dm('dmstate').textContent = (q.thr<=0&&q.brk<=0) ? 'coasting' : '';
}
function dotMenuTrack(){
  const el=dm('dotmenu');
  if(!el.classList.contains('on')) return;
  const q=pedalPts[pedalSel];
  if(!q){ el.classList.remove('on'); return; }
  const at=lineAt(q.s);
  const v=new THREE.Vector3(at.x,at.y+4.6,at.z).project(camera);
  const r=canvas.getBoundingClientRect();
  // behind the camera, or off the edge: park it rather than let it fly about
  if(v.z>1){ el.style.opacity='0.25'; return; }
  el.style.opacity='1';
  el.style.left=(r.left+(v.x*0.5+0.5)*r.width)+'px';
  el.style.top =(r.top +(-v.y*0.5+0.5)*r.height)+'px';
}
/* Drag a number up to raise it. Both pedals are their own value: zero and
   zero is a coast, and nothing stops you asking for both at once -- that is
   left in deliberately rather than forbidden, since it is a legitimate
   thing to want on a corner entry. */
function dragNumber(el,get,set){
  el.addEventListener('pointerdown',e=>{
    e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId);
    let lastY=e.clientY;
    const move=ev=>{
      set(clamp(get()+(lastY-ev.clientY)*0.7,0,100)); lastY=ev.clientY;
      dotMenuFill(); lineRedraw();
    };
    const up=()=>{ el.removeEventListener('pointermove',move);
      el.removeEventListener('pointerup',up); editSave(); };
    el.addEventListener('pointermove',move);
    el.addEventListener('pointerup',up);
  });
}
dragNumber(dm('dmthrval'),()=>pedalPts[pedalSel]?pedalPts[pedalSel].thr:0,
                          v=>{ if(pedalPts[pedalSel]) pedalPts[pedalSel].thr=v; });
dragNumber(dm('dmbrkval'),()=>pedalPts[pedalSel]?pedalPts[pedalSel].brk:0,
                          v=>{ if(pedalPts[pedalSel]) pedalPts[pedalSel].brk=v; });
dm('dmpreview').onclick=()=>{ previewOn?previewStop():previewStart(); };
dm('dmundo').onclick=()=>{
  if(pedalSel<0) return;
  pedalPts.splice(pedalSel,1); pedalSel=-1;
  dm('dotmenu').classList.remove('on');
  lineRedraw(); linePanel(); editSave();
};
dm('dmclose').onclick=dotMenuClose;

function linePanel(){
  document.getElementById('linecount').textContent=
    pedalPts.length+(pedalPts.length===1?' point':' points');
  const el=document.getElementById('linesel');
  /* The two things that can make the preview slow are the pedal numbers you
     wrote and the surface it is standing on -- the engine, the brakes and the
     drag are one piece of code shared with your own car, so they cannot
     differ. Both are on the panel, so a car that will not pull away says why:
     a low throttle figure, or a surface that is not road. */
  el.innerHTML = previewOn
    ? '<div><b id="pvspeed">0</b> km/h · <b id="pvdist">0</b> m · lap <b id="pvlap">1</b></div>'+
      '<div style="opacity:.7">thr <b id="pvthr">0</b>% · brk <b id="pvbrk">0</b>%'+
      ' · pedal <b id="pvpedal">lift</b></div>'+
      '<div style="opacity:.7">accel <b id="pvacc">0 / 0</b> m/s² · '+
      '<b id="pvsurf">road</b></div>'+
      '<div style="opacity:.7">lap <b id="pvlapt">0:00.0</b> · last <b id="pvlast">--</b></div>'
    : '<div style="opacity:.55">Click the line to drop a pedal point.<br>'+
      'Click a point to set throttle and brake.</div>';
}
function lineText(){
  if(!trackRoot) return '';
  return '['+pedalPts.map(q=>{
    const at=lineAt(q.s);
    const m=gridToModel(new THREE.Vector3(at.x,at.y,at.z));
    return '['+Math.round(q.s)+','+Math.round(q.thr)+','+Math.round(q.brk)+
           ']  /* '+m[0]+', '+m[1]+' */';
  }).join(',\n ')+']';
}
document.getElementById('lineundo').onclick=()=>{
  // in L mode with a point picked, Undo takes that point out of the lap;
  // otherwise it is what it always was, the last pedal marker placed
  if(pathEdit && pathSel>=0){ pathDelete(); return; }
  pedalPts.pop(); pedalSel=-1; dm('dotmenu').classList.remove('on');
  lineRedraw(); linePanel(); editSave();
};
document.getElementById('lineclear').onclick=()=>{
  pedalPts=[]; pedalSel=-1; dm('dotmenu').classList.remove('on');
  previewStop(); lineRedraw(); linePanel(); editSave();
};
document.getElementById('linecopy').onclick=e=>{
  const t=lineText();
  console.log('pedal points [metres along the lap, throttle %, brake %]:\n'+t);
  copyFlash(e.currentTarget,t);
};

/* ------------------------------------------------------------------ preview
   The preview car is your car. Not a ghost of it and not a copy of its
   numbers: the same model with the same materials, unfaded; the same makeCar()
   state; the same stepCar() and placeCar(); the same wheels turning at v/r;
   the same driving aids you have switched on; the same camera you drive with;
   the same engine note. The only thing about it that is not yours is the pair
   of hands, and those work the pedals the way yours do.

   That last part is the thing that was wrong, and it was wrong in a way no
   amount of sharing code could fix, because it was in what the code was being
   handed. A pedal marker was going in as a *scale on the engine*: 100% became
   "1.0 times the thrust", 60% became "0.6 times the thrust", as though the
   car had a weaker engine that day. That is not what a percentage on a pedal
   means and it is not what your keyboard does. W is down or it is up. 100%
   means the pedal is on the floor and stays there; 60% means it is being
   feathered -- held for six hundredths of every tenth of a second and
   released for the other four, which is the only honest thing a percentage of
   a key can mean.

   So applyPedals now gets a 1 or a 0 from both cars, always. At 100% the
   preview is doing precisely what you do holding W: same 26 m/s2, same
   (1 - v^2) knee, same top end. */
let previewOn=false, PVCAR=null, pvGroup=null, pvObj=null, pvWheels=[],
    pvWingL=null, pvWingR=null, pvIdx=0, pvS=0, pvPhase=0, pvSpin=0,
    pvHeldT=0, pvHeldB=0, pvAcc=0, pvPrevSpd=0, pvLap=0, pvDist=0,
    pvLapT=0, pvLastLap=0, pvGripHeld=false, pvQ={thr:0,brk:0};
const PV_PULSE=0.10;             // seconds: one feather of a part-pressed pedal

/* The same node in the copy as in the original, found by its place in the
   hierarchy rather than by name, so it works whatever the exporter called
   things. clone(true) keeps the tree shape, so the path is all it takes. */
function pvTwin(node){
  if(!node||!pvGroup) return null;
  const path=[];
  for(let n=node; n&&n!==carGroup; n=n.parent){
    if(!n.parent) return null;
    path.unshift(n.parent.children.indexOf(n));
  }
  let o=pvGroup;
  for(const i of path){ if(!o.children[i]) return null; o=o.children[i]; }
  return o;
}
function pvBuild(){
  /* Rebuilt if the model finished loading after the first preview, or the
     copy would be an empty group with no wheels in it. */
  if(pvGroup && pvWheels.length===wheels.length) return;
  if(pvGroup){ scene.remove(pvGroup); pvGroup=null; }
  /* Materials are shared, not cloned and faded. It is the same car, so it
     should be the same car to look at -- if you cannot tell which one is
     which except by which one is moving, this is doing its job. */
  pvGroup=carGroup.clone(true);
  scene.add(pvGroup);
  pvObj=pvTwin(carObj)||pvGroup;
  pvWheels=[];
  for(const w of wheels){
    const m=pvTwin(w);
    if(m){ m.userData.steers=w.userData.steers; pvWheels.push(m); }
  }
  pvWingL=pvTwin(wingL); pvWingR=pvTwin(wingR);
  /* Aids on if they are on for you. They shape a keyboard's all-or-nothing
     input, and this driver is working a keyboard, so it wants exactly what
     you have. Nothing steers it any more -- it is carried along the line
     itself -- but the grip figure is what the other nine will want. */
  PVCAR=makeCar(pvGroup, AIDS);
  PVCAR.gripMul=AI_GRIP;
}
function previewStart(){
  if(lineSmooth.length<2||!carGroup) return;
  pvBuild();
  PVCAR.aids=AIDS;                 // whatever T is set to right now
  PVCAR.gripMul=AI_GRIP;
  const a=lineSmooth[0], b=lineSmooth[Math.min(3,lineSmooth.length-1)];
  PVCAR.st.speed=0; PVCAR.st.wx=a.x; PVCAR.st.wz=a.z;
  PVCAR.st.hdg=Math.atan2(b.x-a.x,b.z-a.z);
  PVCAR.steerIn=0; PVCAR.steerAng=0; PVCAR.lockF=1;
  PVCAR.groundY=a.y+RIDE; PVCAR.carVY=0; PVCAR.slipAng=0;
  PVCAR.carPitch=0; PVCAR.carRoll=0;
  /* Read the ground it is actually standing on before the first step, rather
     than launching on whatever the last run left in .surf. A run that ended
     in a gravel trap otherwise starts the next one with gravel drag and
     engine bog still applied, which reads as a car that will not pull away. */
  probeCar(PVCAR.st.wx, PVCAR.st.wz, PVCAR.st.hdg, PVCAR.groundY-RIDE, PVCAR.surf);
  pvIdx=0; pvS=0; pvPhase=0; pvAcc=0; pvPrevSpd=0; pvHeldT=0; pvHeldB=0; pvLap=0;
  pvDist=0; pvLapT=0; pvLastLap=0;
  pvGroup.visible=true; previewOn=true;
  document.getElementById('linepreview').textContent='Stop';
  dm('dmpreview').textContent='Stop';
  linePanel();
}
function previewStop(){
  previewOn=false;
  if(pvGroup) pvGroup.visible=false;
  const b=document.getElementById('linepreview'); if(b) b.textContent='Preview';
  const b2=dm('dmpreview'); if(b2) b2.textContent='Preview';
  linePanel();
}
function previewReset(){ previewStop(); pvIdx=0; pvS=0; pvDist=0; pvLap=0;
                        pvLapT=0; if(PVCAR) PVCAR.st.speed=0; }
document.getElementById('linepreview').onclick=()=>{ previewOn?previewStop():previewStart(); };
document.getElementById('linereset').onclick=previewReset;
/* A pedal, worked by a pair of hands. Down or up -- never "some fraction of
   an engine". Flat out is held; anything less is feathered on and off within
   a tenth of a second, so 60% is the pedal down for 60% of the time and the
   car in between is doing exactly what your car does when you lift. */
function pvPedal(pct){
  if(pct>=99.5) return 1;
  if(pct<=0.5)  return 0;
  return ((pvPhase%PV_PULSE)/PV_PULSE) < pct/100 ? 1 : 0;
}
/* The driver: the two pedals off the marker in force. There is no steering
   input any more -- the car is on the line rather than steered at it, so
   where it goes is the line's business and only how fast is the driver's. */
function pvInputs(C,dt){
  let q=pedalAt(pvS, pvLap>0);
  /* A marker holds until the next one -- but a brake marker has nothing left
     to do once the car is stopped, and holding it is a deadlock: the car sits
     still, so its distance along the line never advances, so the marker in
     force never changes, so it sits still. It brakes perfectly and then never
     drives again, which is not a fault in the numbers and should not look
     like one. Stopped with nothing on the throttle, it takes the next
     marker's instruction, the way a driver who had stopped would. */
  if(C.st.speed<0.5 && q.thr<=0){
    for(const n of pedalPts){ if(n.s>pvS){ q=n; break; } }
  }
  pvPhase+=dt; pvQ=q;
  pvHeldT=pvPedal(q.thr); pvHeldB=pvPedal(q.brk);
  return { thr:pvHeldT, brk:pvHeldB };
}
function pvWrap(s){
  if(!lineLen) return 0;
  if(!lineClosed) return clamp(s,0,lineLen);
  s%=lineLen; return s<0?s+lineLen:s;
}
/* The curve itself, at a distance along it -- continuous position and
   continuous heading, rather than the direction of whichever 2.5 m sample the
   car is standing on. This is the difference between a car that flows round
   Pouhon and one that shivers its way round. */
const _lp=new THREE.Vector3(), _lp2=new THREE.Vector3(), _lt=new THREE.Vector3();
function lineHdgAt(s){
  if(!lineCurve||!lineLen) return lineAt(s).hdg;
  lineCurve.getTangentAt(clamp(pvWrap(s)/lineLen,0,1),_lt);
  return Math.atan2(_lt.x,_lt.z);
}
function linePosAt(s,out){
  if(!lineCurve||!lineLen) { const a=lineAt(s); return out.set(a.x,a.y,a.z); }
  return lineCurve.getPointAt(clamp(pvWrap(s)/lineLen,0,1),out);
}
/* Curvature: how much the heading turns per metre, over a baseline long
   enough that the hand-clicked control points do not show through it. */
function lineCurv(s,span){
  const h=span||6;
  let d=lineHdgAt(s+h*0.5)-lineHdgAt(s-h*0.5);
  while(d> Math.PI) d-=2*Math.PI;
  while(d<-Math.PI) d+=2*Math.PI;
  return d/h;
}
/* Grip, for a car that is on the line rather than steered at it.

   Infinite was the wrong answer and so was the old ceiling. A railed car
   cannot understeer, so a yaw limit does nothing to it at all -- the number
   has to show up somewhere else or it is not a number about anything. Where
   it shows up is speed: the fastest a corner can be taken is sqrt(a/k), the
   lateral grip over the curvature, and that is a limit this car can be held
   to exactly because it always knows which corner it is in.

   80% more than the player's, as asked. On this circuit that is barely felt
   anywhere quick -- Eau Rouge would allow over 450 kph and the car only does
   360 -- and it is the slow corners where it bites: about 170 through La
   Source, 190 through the Bus Stop. Which is what stops "flat out" meaning
   "takes the hairpin at 360 and looks ridiculous".

   It brakes for them properly rather than braking when it arrives: the limit
   is worked out over the distance it would need to slow down, so it is off
   the throttle before the corner the way anybody would be. */
/* Your grip. A_GRIP is the car's lateral figure, 50 m/s2, and the AI gets
   exactly that -- same tyres, same 5.1 g. Any corner it takes is a corner you
   can take. */
const AI_GRIP=1;                 // times the player's own lateral grip
/* How much of that it actually uses when it is racing you.

   At everything it has, it is not an opponent, it is a rumour: it is out of
   sight before the first corner is over, which is not a race and is not even a
   thing to watch. A pace figure below 1 slows it
   in the corners and nowhere else, which is exactly where the difference
   between a car on a perfect line and a person driving one shows up -- both
   cars have the same engine, so the straights were never going to separate
   them. Previewing a line still uses everything, since there the question is
   what the line is worth rather than whether you can take it. */
let AI_PACE=0.75;
const AI_PACES=[0.55,0.65,0.75,0.85,1.0];
function paceBtn(){
  const b=document.getElementById('linepace');
  if(b) b.textContent='Pace '+Math.round(AI_PACE*100)+'%';
}
function pvCornerSpeed(s, v){
  let lim=Infinity;
  // how far ahead it needs to care about, from its own braking rate
  const look=Math.min(500, v*v/(2*46)+40);
  for(let d=0; d<look; d+=6){
    /* Over fifteen metres, not six. Curvature is the second derivative of
       points clicked by hand, so a short baseline finds corners that are not
       there -- and it finds most of them in a fast sequence of kinks, which is
       exactly what Eau Rouge is. Fifteen metres is still far shorter than any
       real corner here, so a genuine one reads at full strength: over an arc
       of constant radius this is exact, and it only rounds off the entry and
       exit of one. */
    const k=Math.abs(lineCurv(pvWrap(s+d),15));
    if(k<2e-4) continue;                       // straight enough to ignore
    /* A_GRIP alone, not A_GRIP*turnBoost. turnBoost is how much more the car
       is allowed to rotate than the tyres would really give -- steering feel,
       deliberately unphysical, up to 4x. Multiplying a cornering speed by it
       claims 36 g and the limit stops limiting anything: La Source at 271 kph.
       The honest figure is the lateral grip itself, and the AI runs the same
       one you do. */
    const pace = raceOn ? AI_PACE : 1;
    const vc=Math.sqrt(A_GRIP*AI_GRIP/k)*pace;             // through that corner
    // and the speed it may be doing here to still be down to vc by then
    const allow=Math.sqrt(vc*vc + 2*46*d);
    if(allow<lim) lim=allow;
  }
  return lim;
}
function previewStep(dt,t){
  dotMenuTrack();
  // the same car runs in a race; what differs there is only that the camera
  // and the engine note stay with you, since you are the one driving
  if(!(previewOn||raceOn)||lineSmooth.length<2||!PVCAR||!lineLen) return;
  if(raceOn && raceCd>0) return;                     // held on the line

  /* The AI is on the line, and "on" is meant literally: its position is a
     distance along the curve and its heading is the curve's own tangent, so
     it cannot drift off, cut an apex or run wide. That is the whole point of
     it -- it is there to show what the line is worth, not to audition a
     driver, and a car that misses the apex by four metres is answering a
     question nobody asked.

     Steering it there by pure pursuit could never do this, whatever the grip:
     the aim point runs up to 55 m ahead, and an aim point that far up the road
     cuts every corner it meets. The rack adds its own lag on top -- a 0.23 s
     ramp on the input is 18 m of road at 300 kph.

     Everything along the line is still the shared car, unchanged: the same
     applyPedals for the engine and brakes, the same coast drag, the same
     gravel and grass under the wheels. Speed is the car's; the path is the
     line's. */
  const inp=pvInputs(PVCAR,dt);
  applyPedals(PVCAR.st, inp.thr, inp.brk, PVCAR.surf, dt);
  surfaceDrag(PVCAR.st, PVCAR.surf, dt);
  // and it will not carry more speed into a corner than the corner will take
  const vLim=pvCornerSpeed(pvDist, PVCAR.st.speed);
  pvGripHeld = PVCAR.st.speed>vLim;
  if(pvGripHeld) PVCAR.st.speed=Math.max(vLim, PVCAR.st.speed-46*dt);

  const prev=pvDist;
  pvDist=pvWrap(pvDist+PVCAR.st.speed*dt);
  pvLapT+=dt;
  // it is on the line to the metre, so the lap time is now a real number about
  // the pedal markers rather than about how well something drove
  if(pvDist<prev){ pvLap++; pvLastLap=pvLapT; pvLapT=0; }
  if(!lineClosed && pvDist>=lineLen-0.5){ previewReset(); return; }

  linePosAt(pvDist,_lp);
  PVCAR.st.wx=_lp.x; PVCAR.st.wz=_lp.z; PVCAR.st.hdg=lineHdgAt(pvDist);
  pvS=pvDist;
  pvIdx=Math.min(lineSmooth.length-1, Math.round(pvDist/LINE_STEP));
  /* The front wheels point where the line is going: the angle a car of this
     wheelbase would need for the curvature it is on. Eased, because curvature
     is the second derivative of points somebody clicked by hand and it is
     lumpy however smooth the path through them is -- the car's line is exact,
     only the wheels are averaged, and a real rack has that lag anyway. */
  const wantAng=clamp(-STEER_RATIO*Math.atan(WHEELBASE*lineCurv(pvDist)),
                      -STEER_LOCK, STEER_LOCK);
  PVCAR.steerAng += (wantAng-PVCAR.steerAng)*(1-Math.pow(0.0005,dt));
  placeCar(PVCAR, dt, t);
  // and its wheels turn, by the same v/r the player's do -- a car gliding on
  // frozen wheels reads as slow however fast the number says it is going
  pvSpin+=(PVCAR.st.speed/wheelR)*dt;
  if(pvSpin>6.283185307) pvSpin-=6.283185307;
  turnWheels(pvWheels, pvWingL, pvWingR, pvSpin, PVCAR.steerAng);
  // the cockpit camera reads a mount point off the bodywork, so its matrices
  // have to be current before the camera runs -- same as the player's car
  pvGroup.updateMatrixWorld(true);

  /* Measured, not asserted. This is the acceleration the car is actually
     getting, next to what a clean car flat out would get at this speed --
     26*(1-v^2). Equal means the preview is your car; short means something is
     taking it, and the surface beside it says what. */
  const dv=(PVCAR.st.speed-pvPrevSpd)/Math.max(dt,1e-4);
  pvPrevSpd=PVCAR.st.speed;
  pvAcc += (dv-pvAcc)*(1-Math.pow(0.02,dt));      // eased, or it is unreadable
  const vN=PVCAR.st.speed/MAXSPEED, ideal=26.0*(1-vN*vN);

  const sp=document.getElementById('pvspeed');
  if(sp) sp.textContent=Math.round(PVCAR.st.speed*3.6);
  const th=document.getElementById('pvthr');
  if(th) th.textContent=Math.round(pvQ.thr);
  const bk=document.getElementById('pvbrk');
  if(bk) bk.textContent=Math.round(pvQ.brk);
  const pd=document.getElementById('pvpedal');
  if(pd) pd.textContent = pvGripHeld ? 'GRIP' : inp.brk ? 'BRAKE' : inp.thr ? 'FLAT' : 'lift';
  const ac=document.getElementById('pvacc');
  if(ac){ ac.textContent=pvAcc.toFixed(1)+' / '+ideal.toFixed(1);
          ac.style.color = (inp.thr && pvAcc < ideal-3) ? '#ff5544' : ''; }
  const sf=document.getElementById('pvsurf');
  if(sf){
    const S=PVCAR.surf;
    sf.textContent = S.loose ? 'GRAVEL '+Math.round(S.looseFrac*100)+'%'
                   : S.grass ? 'GRASS '+Math.round(S.grassFrac*100)+'%'
                   : 'road';
    sf.style.color = (S.loose||S.grass) ? '#ff5544' : '';
  }
  const ds=document.getElementById('pvdist'); if(ds) ds.textContent=Math.round(pvS);
  const lp=document.getElementById('pvlap'); if(lp) lp.textContent=pvLap+1;
  const lt=document.getElementById('pvlapt');
  if(lt) lt.textContent=pvClock(pvLapT);
  const ll=document.getElementById('pvlast');
  if(ll) ll.textContent=pvLastLap?pvClock(pvLastLap):'--';
}
function pvClock(sec){
  const m=Math.floor(sec/60), s=sec-m*60;
  return m+':'+(s<10?'0':'')+s.toFixed(1);
}

/* ------------------------------------------------- the pedals, worked out
   Where to brake, how hard, and where to get back on it -- for the whole lap,
   from the shape of the line and the car's own numbers. Placing these by hand
   is the slow, miserable part of authoring a lap, and it is slow for a reason:
   a braking point is not a property of the corner you are at. It is set by the
   corner *ahead*, by how fast you arrive, and by how hard this car stops, and
   changing any one of those moves it. That is arithmetic, not judgement.

   The standard three passes, on samples 2.5 m apart:

   1. What each point of the lap allows on its own -- sqrt(a/k), the grip over
      the curvature there, capped at the car's top speed.
   2. Backwards round the lap, applying the brakes: no point may be quicker
      than what it can still slow down from before the next one. This is what
      pulls the braking point back up the straight, and pulls it further for a
      slower corner, which is the whole thing you would otherwise be hunting
      for by trial and error.
   3. Forwards round the lap, applying the engine: no point may be quicker
      than the engine can get it to from the last one, using the same
      26*(1-v^2) curve the car itself uses. This is what puts the exit right.

   Twice round, since it is a closed lap and the start of the first pass has
   not seen the end of it yet.

   Then the profile is turned back into pedals: what acceleration each stretch
   needs, as a percentage of the 46 m/s2 the brakes give or of the engine at
   that speed, with a coast where it needs neither. Markers are emitted only
   where that materially changes, so you get a few dozen you can read and
   argue with rather than three thousand.

   It uses the pace setting, so "work out the pedals" at 65% gives a lap a
   careful driver could hold, and at 100% the fastest the line allows. */
function lineAutoPedals(){
  if(!lineLen||lineSmooth.length<8) return 0;
  const N=lineSmooth.length, ds=lineLen/N, BRK=46;
  const v=new Float64Array(N);
  for(let i=0;i<N;i++){
    const k=Math.abs(lineCurv(i*ds,15));      // see pvCornerSpeed for the 15
    v[i] = k<2e-4 ? MAXSPEED
                  : Math.min(MAXSPEED, Math.sqrt(A_GRIP*AI_GRIP/k)*AI_PACE);
  }
  const eng=u=>26.0*(1-(u/MAXSPEED)*(u/MAXSPEED));
  for(let pass=0;pass<2;pass++){
    for(let n=N;n>0;n--){                       // brakes, backwards
      const i=(n-1)%N, j=n%N;
      const cap=Math.sqrt(v[j]*v[j]+2*BRK*ds);
      if(v[i]>cap) v[i]=cap;
    }
    for(let n=0;n<N;n++){                       // engine, forwards
      const i=n%N, j=(n+1)%N;
      const cap=Math.sqrt(v[i]*v[i]+2*Math.max(eng(v[i]),0)*ds);
      if(v[j]>cap) v[j]=cap;
    }
  }
  /* pedals from the profile, then runs of the same pedal merged into one
     marker at the point it starts */
  const out=[];
  let lastT=-99, lastB=-99;
  for(let i=0;i<N;i++){
    const j=(i+1)%N;
    const a=(v[j]*v[j]-v[i]*v[i])/(2*ds);
    let thr=0, brk=0;
    if(a<-0.6)      brk=clamp(-a/BRK*100,0,100);
    else if(a>0.6)  thr=clamp(a/Math.max(eng(v[i]),1e-3)*100,0,100);
    else            thr=clamp((0.8+v[i]*0.028)/Math.max(eng(v[i]),1e-3)*100,0,100);
    thr=Math.round(thr/5)*5; brk=Math.round(brk/5)*5;
    const chg=Math.max(Math.abs(thr-lastT),Math.abs(brk-lastB));
    // brakes ramp in over a few metres, which would otherwise leave a 90% and
    // a 100% marker three metres apart and nothing to choose between them
    const room = !out.length || (i*ds-out[out.length-1].s)>=12;
    if(chg>=10 && (room||chg>=35)){
      out.push({s:i*ds, thr, brk});
      lastT=thr; lastB=brk;
    }
  }
  if(!out.length) return 0;
  pedalPts=out; pedalSel=-1; pedalSort();
  dm('dotmenu').classList.remove('on');
  lineRedraw(); linePanel(); editSave();
  return out.length;
}
document.getElementById('lineauto').onclick=()=>{
  const n=lineAutoPedals();
  const b=document.getElementById('lineauto');
  if(b){ b.textContent=n?n+' markers':'need a lap first';
         setTimeout(()=>{ b.textContent='Work out the pedals'; },2200); }
};

/* --------------------------------------------------------------- the race
   One lap of the line, side by side off the start, 3-2-1-GO.

   The AI is the preview car doing exactly what it does in a preview -- on the
   line, flat where the line allows it, off the throttle early enough for the
   corner it is coming to -- so a race is an honest measure of the line as much
   as of you. What changes is who the camera and the engine note belong to:
   both stay with your car, because you are driving.

   Where each car goes is the only thing that has to be invented here. The AI
   starts on the line, since that is where it lives; you start beside it, one
   car's width to the right, which is the side the run-off is on at the start
   at Spa. Your progress is measured along the same curve it drives, so the
   gap between you is a real distance on the same lap rather than two
   different measurements compared.

   You can leave the road, spin, or drive the lap backwards -- the gap simply
   stops making sense until you rejoin, which is a fair description of what
   has happened to your race anyway. */
let raceOn=false, raceCd=0, raceMyIdx=0, raceMyDist=0, raceMyLap=0,
    raceT=0, raceAiT=0, raceAiDone=false, raceLaps=1;
const raceBox=document.getElementById('racebox');
const raceEndEl=document.getElementById('raceend');
function raceStop(){
  raceOn=false; raceCd=0;
  raceBox.classList.remove('show');
  // the other car leaves the circuit rather than standing on it like a bollard
  if(pvGroup && !previewOn) pvGroup.visible=false;
  const b=document.getElementById('linerace'); if(b) b.textContent='Race the AI';
}
function raceStart(){
  editRestore();                      // K works without opening the editor first
  if(lineSmooth.length<2||!lineLen||!carGroup) return;
  if(!lineClosed){ goEl.textContent='LINE MUST BE A LAP';
                   goEl.classList.add('show');
                   setTimeout(()=>goEl.classList.remove('show'),1600); return; }
  previewStop();                      // the preview camera must not steal the view
  pvBuild();
  // the AI on the line, stopped
  PVCAR.aids=AIDS; PVCAR.gripMul=AI_GRIP;
  PVCAR.st.speed=0; PVCAR.steerAng=0; PVCAR.slipAng=0;
  PVCAR.carPitch=0; PVCAR.carRoll=0; PVCAR.carVY=0;
  pvDist=0; pvLap=0; pvLapT=0; pvLastLap=0; pvPhase=0; pvSpin=0;
  linePosAt(0,_lp);
  PVCAR.st.wx=_lp.x; PVCAR.st.wz=_lp.z; PVCAR.st.hdg=lineHdgAt(0);
  PVCAR.groundY=_lp.y+RIDE;
  probeCar(PVCAR.st.wx,PVCAR.st.wz,PVCAR.st.hdg,PVCAR.groundY-RIDE,PVCAR.surf);
  pvGroup.visible=true;
  /* You start behind it and off to one side, the way a grid is staggered --
     not level with it. Level looked right on paper and was useless in the
     car: from the cockpit, a car exactly beside you is at ninety degrees,
     which is outside the field of view of any camera here, so the race began
     with the thing you are racing invisible and it was never seen again. Ten
     metres back puts it in front of you, where you can watch it brake. */
  const h=PVCAR.st.hdg, rx=Math.cos(h), rz=-Math.sin(h);     // right of the line
  linePosAt(pvWrap(-10),_lp2);
  carState.speed=0;
  carState.wx=_lp2.x+rx*4.4; carState.wz=_lp2.z+rz*4.4;
  carState.hdg=lineHdgAt(pvWrap(-10));
  PLAYER.steerIn=0; PLAYER.steerAng=0; PLAYER.slipAng=0; PLAYER.carVY=0;
  PLAYER.groundY=_lp.y+RIDE;
  clearDebris();
  /* You are ten metres back, so you are ten metres short of the lap: your
     count starts at -1 and the first crossing of the line, a second later,
     makes it 0. Otherwise the flag falls ten metres early. */
  raceMyIdx=Math.max(0,lineSmooth.length-Math.round(10/LINE_STEP));
  raceMyDist=lineCum[raceMyIdx]; raceMyLap=-1;
  raceT=0; raceAiT=0; raceAiDone=false;
  raceOn=true; raceCd=3.999;
  startPhase='hold'; startT=0; holdFor=1e9;   // you are pinned until GO
  lightsEl.classList.remove('show');
  raceBox.classList.add('show');
  raceEndEl.classList.remove('show');
  gridShow(false); pathShow(false);           // out of the editor, into the car
  const b=document.getElementById('linerace'); if(b) b.textContent='Stop race';
}
/* Your distance round the same lap the AI is driving, searched forward from
   where you were so a hairpin's return leg cannot claim you. */
function raceProgress(){
  const N=lineSmooth.length, win=Math.ceil(200/LINE_STEP);
  let bi=raceMyIdx, bd=Infinity;
  for(let k=0;k<win;k++){
    const i=(raceMyIdx+k)%N;
    const dx=lineSmooth[i].x-carState.wx, dz=lineSmooth[i].z-carState.wz;
    const d=dx*dx+dz*dz;
    if(d<bd){ bd=d; bi=i; }
  }
  if(bi<raceMyIdx) raceMyLap++;
  raceMyIdx=bi; raceMyDist=lineCum[bi];
}
function raceUpdate(dt){
  if(!raceOn) return;
  if(raceCd>0){
    const was=Math.ceil(raceCd);
    raceCd-=dt;
    const now=Math.ceil(raceCd);
    if(now!==was){
      goEl.textContent = now>0 ? String(now) : 'GO';
      goEl.classList.add('show');
      if(now<=0){ startPhase='go'; startT=0;
                  setTimeout(()=>goEl.classList.remove('show'),1100); }
    }
    return;                            // nothing moves until the lights go out
  }
  raceT+=dt;
  if(!raceAiDone) raceAiT=raceT;
  raceProgress();
  // the AI has its own finish, and keeps going round until you are done
  if(!raceAiDone && pvLap>=raceLaps){ raceAiDone=true; raceAiT=raceT; }
  const mine=raceMyLap*lineLen+raceMyDist, theirs=pvLap*lineLen+pvDist;
  const gapM=theirs-mine;
  const ref=Math.max(carState.speed, 12);          // metres to seconds
  const lapEl=document.getElementById('racelap');
  if(lapEl) lapEl.textContent='LAP '+clamp(raceMyLap+1,1,raceLaps)+' / '+raceLaps;
  const gEl=document.getElementById('racegap');
  if(gEl){
    const s=Math.abs(gapM)/ref;
    gEl.textContent=(gapM>0?'+':'-')+s.toFixed(1);
    gEl.className = gapM>0 ? 'behind' : 'ahead';
  }
  if(raceMyLap>=raceLaps) raceFinish();
}
function raceFinish(){
  const won = !raceAiDone || raceT<=raceAiT;
  raceStop();
  raceEndEl.classList.add('show');
  document.getElementById('raceendmsg').textContent = won?'YOU WIN':'AI WINS';
  document.getElementById('raceendsub').textContent =
    'you '+pvClock(raceT)+'  ·  ai '+(raceAiDone?pvClock(raceAiT):'still out there');
  setTimeout(()=>raceEndEl.classList.remove('show'),6000);
}
document.getElementById('linerace').onclick=()=>{ raceOn?raceStop():raceStart(); };
document.getElementById('linepace').onclick=()=>{
  const i=AI_PACES.indexOf(AI_PACE);
  AI_PACE=AI_PACES[(i+1)%AI_PACES.length];
  paceBtn();
};
paceBtn();

/* Where the other car is, on the screen. It is a real car in the world and it
   is drawn like one, but on a circuit this size "drawn" and "visible" are not
   the same thing: over a crest, behind a tree, or four hundred metres up the
   road at Kemmel, there is nothing to see and no way to tell whether you are
   losing by a little or by a lot. So it is always marked -- a chevron over the
   car when it is in front of you, and pinned to the edge of the screen with
   the distance on it when it is not. */
const _mk=new THREE.Vector3();
function aiMarkUpdate(){
  const el=document.getElementById('aimark');
  if(!el) return;
  if(!(raceOn && PVCAR && pvGroup && pvGroup.visible && raceCd<=0)){
    el.classList.remove('show'); return;
  }
  _mk.set(PVCAR.st.wx, PVCAR.groundY+1.4, PVCAR.st.wz).project(camera);
  const behind=_mk.z>1;
  const w=innerWidth, h=innerHeight, pad=34;
  let x=(_mk.x*0.5+0.5)*w, y=(-_mk.y*0.5+0.5)*h;
  // a point behind the camera projects to the opposite side, so reflect it
  // through the middle of the screen before clamping or the arrow points the
  // wrong way exactly when you most want to know
  if(behind){ x=w-x; y=h+pad; }
  const off = behind || x<pad || x>w-pad || y<pad || y>h-pad;
  const cx=clamp(x,pad,w-pad), cy=clamp(y,pad,h-pad);
  el.style.left=cx+'px'; el.style.top=cy+'px';
  el.classList.toggle('edge',off);
  el.classList.add('show');
  const ar=document.getElementById('aiarrow');
  if(ar){
    // pointing from the middle of the screen at where it really is when it is
    // off the edge, and simply down at the car when it is on screen
    const a=off ? Math.atan2(cy-h*0.5, cx-w*0.5)+Math.PI/2 : Math.PI;
    ar.style.transform='rotate('+a+'rad)';
  }
  const ds=document.getElementById('aidist');
  if(ds){
    const dx=PVCAR.st.wx-carState.wx, dz=PVCAR.st.wz-carState.wz;
    ds.textContent=Math.round(Math.hypot(dx,dz))+' m';
  }
}
