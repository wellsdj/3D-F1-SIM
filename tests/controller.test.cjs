/* The pad. The bindings are the contract -- R2 throttle, L2 brake, left stick
   steering only, right stick back to look behind, L1/R1 for tabs, cross to
   choose -- so they are checked as such, and the two pieces that are pure
   (which way a stick is pointing, and which item is that way) are run. */
const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','home-apex.css'),'utf8');

function liftAll(res, ctx, tail){
  const code=res.map(re=>{ const m=source.match(re);
    assert.ok(m, 'could not find '+re); return m[0]; }).join('\n');
  vm.runInNewContext(code+'\n'+(tail||''), ctx);
  return ctx;
}

test('the pedals are the triggers, and nothing is bound to coasting',()=>{
  assert.match(source,/const PAD=\{ cross:0, circle:1, square:2, triangle:3, l1:4, r1:5, l2:6, r2:7,/);
  assert.match(source,/controllerThr=clamp\(padValue\(PAD\.r2\),0,1\);/);
  assert.match(source,/controllerBrk=clamp\(padValue\(PAD\.l2\),0,1\);/);
  /* Analog, not a pair of booleans: a trigger that reports travel gets travel. */
  assert.match(source,/if\(controllerThr>0\)\{ thrMag=Math\.max\(thrMag,controllerThr\); thr=true; \}/);
  assert.match(source,/if\(controllerBrk>0\)\{ brkMag=Math\.max\(brkMag,controllerBrk\); brk=true; \}/);
  /* The bumpers no longer drive: they are the tabs now. */
  assert.doesNotMatch(source,/controllerAccel=pressed\(5\)/);
  assert.doesNotMatch(source,/controllerBrake=pressed\(4\)/);
});

test('steering is the left stick sideways, and the right stick looks back',()=>{
  assert.match(source,/const axis=padAxis\(0\);\s*\n\s*controllerSteer=Math\.abs\(axis\)>\.12\?clamp\(axis,-1,1\):0;/);
  /* Axis 1 -- the left stick pushed forward or back -- is read for menus and
     never for driving. */
  assert.doesNotMatch(source,/controllerSteer=.*padAxis\(1\)/);
  assert.match(source,/controllerBack=padAxis\(3\)>0\.55;/);
  assert.match(source,/if\(controllerBack\) LOOKBACK=true; else if\(wasBack\) LOOKBACK=false;/);
});

test('the front end is L1/R1 for tabs, the d-pad to move, cross to choose',()=>{
  assert.match(source,/if\(padEdge\(PAD\.l1\)\) padTab\(-1\);/);
  assert.match(source,/if\(padEdge\(PAD\.r1\)\) padTab\(1\);/);
  assert.match(source,/if\(padEdge\(PAD\.cross\)\) padChoose\(\);/);
  /* Polled on its own clock, because the world's loop does not run until a
     circuit has been built and the front end is where a pad starts. */
  assert.match(source,/setInterval\(padLoop,16\);/);
  /* And the pad has a cursor you can see. */
  assert.match(css,/\.padfocus\{/);
  assert.match(source,/el\.classList\.add\('padfocus'\);/);
});

test('a direction comes off the d-pad first and the left stick second',()=>{
  const ctx={Math};
  liftAll([/const PAD=\{[\s\S]*?\};/, /const PAD_TRIG=[\d.]+;/, /const PAD_STICK=[\d.]+;/,
           /function padDir\(\)\{[\s\S]*?\n\}/], ctx,
    `let pad={buttons:[],axes:[0,0,0,0]};
     function padDown(i){ return !!pad.buttons[i]; }
     function padAxis(i){ return pad.axes[i]||0; }
     this.set=(b,a)=>{ pad={buttons:b||[], axes:a||[0,0,0,0]}; };
     this.padDir=padDir;`);
  const {set, padDir}=ctx;
  set([],[0,0,0,0]);
  assert.equal(padDir(),'', 'at rest it is pointing nowhere');
  const dpad=i=>{ const b=[]; b[i]=true; return b; };
  set(dpad(12)); assert.equal(padDir(),'up');
  set(dpad(13)); assert.equal(padDir(),'down');
  set(dpad(14)); assert.equal(padDir(),'left');
  set(dpad(15)); assert.equal(padDir(),'right');
  set([],[0,-0.9,0,0]); assert.equal(padDir(),'up');
  set([],[0.9,0,0,0]);  assert.equal(padDir(),'right');
  set([],[0.2,0.2,0,0]); assert.equal(padDir(),'', 'a resting stick does not drift');
  /* A diagonal resolves to the axis it is furthest along, not to both. */
  set([],[0.9,0.5,0,0]); assert.equal(padDir(),'right');
  set([],[0.5,0.9,0,0]); assert.equal(padDir(),'down');
  /* The right stick never moves the cursor. */
  set([],[0,0,0.9,0.9]); assert.equal(padDir(),'');
});

test('moving the cursor picks the nearest thing that way, not the next in the document',()=>{
  const ctx={Math, Infinity};
  liftAll([/function padMove\(dir\)\{[\s\S]*?\n\}/], ctx,
    `let items=[], focus=null, marked=null;
     function padItems(){ return items; }
     function padMark(el){ marked=el; focus=el; }
     this.load=(list,start)=>{ items=list; focus=start||null; marked=null; };
     this.marked=()=>marked;
     this.padMove=padMove;
     Object.defineProperty(this,'padFocusRef',{get:()=>focus});
     this.setFocus=f=>{focus=f;};
     Object.defineProperty(globalThis,'padFocus',{get:()=>focus,set:v=>{focus=v;},configurable:true});`);
  const box=(name,x,y)=>({name, getBoundingClientRect:()=>({left:x,top:y,width:100,height:40})});
  /* Two rows of two: the layout the front end actually has. */
  const a=box('a',0,0), b=box('b',200,0), c=box('c',0,100), d=box('d',200,100);
  ctx.load([a,b,c,d], a);
  ctx.padMove('right'); assert.equal(ctx.marked().name,'b','right of a is b');
  ctx.load([a,b,c,d], a);
  ctx.padMove('down');  assert.equal(ctx.marked().name,'c','below a is c, not the next in order');
  ctx.load([a,b,c,d], d);
  ctx.padMove('up');    assert.equal(ctx.marked().name,'b');
  ctx.load([a,b,c,d], d);
  ctx.padMove('left');  assert.equal(ctx.marked().name,'c');
  /* Nothing that way leaves the cursor where it is. */
  ctx.load([a,b,c,d], a);
  ctx.padMove('up');    assert.equal(ctx.marked(),null);
  /* And with nothing focused at all it lands on the first thing. */
  ctx.load([a,b,c,d], null);
  ctx.padMove('down');  assert.equal(ctx.marked().name,'a');
});

test('the settings page tells you the bindings it actually has',()=>{
  assert.match(source,/<b>R2<\/b> throttle/);
  assert.match(source,/<b>L2<\/b> brake &amp; reverse/);
  assert.match(source,/<b>Right stick back<\/b> look behind/);
  assert.match(source,/<b>L1 \/ R1<\/b> change tab/);
  assert.match(source,/<b>Cross \/ A<\/b> select/);
  assert.doesNotMatch(source,/<b>RB \/ R1<\/b> accelerate/);
});
