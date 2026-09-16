/* Two rules that only apply somewhere: practice is stricter than everything
   else, and a place taken off the road is a place you give back. */
const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

test('a practice lap ends the moment a wheel leaves the circuit',()=>{
  /* Any surface, anywhere on the lap -- not the four-wheels-off rule and not
     only the policed last third. */
  assert.match(source,/careerSlot\(\)\.weekend\.stage==='practice'\s*\n\s*&& PLAYER\.surf && \(PLAYER\.surf\.grass\|\|PLAYER\.surf\.loose\)/);
  assert.match(source,/ttVoid\(PLAYER\.surf\.loose\?'Gravel':'Grass'\)/);
  /* It runs before the four-wheel count, so the ordinary rule cannot get
     there first and swallow it. */
  const practice=source.indexOf("weekend.stage==='practice'");
  const fourWheels=source.indexOf('for(let i=0;i<4;i++) if(tlWheelOn(');
  assert.ok(practice>0 && practice<fourWheels, 'practice is judged first');
  /* And it only voids once per lap. */
  assert.match(source,/&& !sessionLapInvalid\)\{\s*\n\s*sessionLapInvalid=true;/);
});

test('twenty seconds to give the place back, then five',()=>{
  const ctx={Math};
  const code=[/const GIVE=\{[^}]*\};/, /const GIVE_WINDOW=\d+, GIVE_PENALTY=\d+;/,
              /function giveStart\(pos\)\{[\s\S]*?\n\}/, /function giveStep\(dt\)\{[\s\S]*?\n\}/]
    .map(re=>{const m=source.match(re); assert.ok(m,'missing '+re); return m[0];}).join('\n');
  vm.runInNewContext(code+`
    let said=[];
    function limitsSay(h,s){ said.push(h); }
    function limitsPaint(){}
    this.said=()=>said; this.giveStart=giveStart; this.giveStep=giveStep;
    this.GIVE=GIVE; this.LIMITS=LIMITS; this.RACE=RACE; this.RESULT=RESULT;
    this.W=GIVE_WINDOW; this.P=GIVE_PENALTY;`,
    Object.assign(ctx,{LIMITS:{after:0}, RACE:{on:true, pos:4}, RESULT:{on:false}}));
  const {giveStart,giveStep,GIVE,LIMITS,RACE,W,P}=ctx;
  assert.equal(W,20); assert.equal(P,5);

  /* Came out of it a place up: the clock runs. */
  giveStart(5);
  assert.equal(GIVE.on,true);
  assert.equal(GIVE.t,20);
  for(let t=0;t<19;t+=0.5) giveStep(0.5);
  assert.equal(GIVE.on,true,'still running at nineteen seconds');
  assert.equal(LIMITS.after,0,'and nothing has been charged yet');
  for(let t=0;t<2;t+=0.5) giveStep(0.5);
  assert.equal(GIVE.on,false);
  assert.equal(LIMITS.after,P,'five seconds at the flag');

  /* Hand it back inside the window and nothing happened. */
  LIMITS.after=0; RACE.pos=4;
  giveStart(5);
  giveStep(1); giveStep(1);
  RACE.pos=5;                       // the place is theirs again
  giveStep(0.5);
  assert.equal(GIVE.on,false);
  assert.equal(LIMITS.after,0,'no penalty for giving it back');

  /* Dropping further back than you were is also giving it back. */
  LIMITS.after=0; RACE.pos=4; giveStart(5); RACE.pos=7; giveStep(0.5);
  assert.equal(LIMITS.after,0);

  /* The flag ends it, whatever the clock says. */
  LIMITS.after=0; RACE.pos=4; giveStart(5); ctx.RESULT.on=true; giveStep(0.5);
  assert.equal(GIVE.on,false);
  assert.equal(LIMITS.after,0);
});

test('a place gained off the road does not also go on the warning ladder',()=>{
  assert.match(source,/if\(RACE\.on && _tlPosWas && \(RACE\.pos\|\|0\) < _tlPosWas && limitsGained\(\)\)\{\s*\n\s*giveStart\(_tlPosWas\);\s*\n\s*return;/);
  /* And a new session clears the clock. */
  assert.match(source,/GIVE\.on=false; GIVE\.t=0; GIVE\.pos=0; GIVE\.said=0;/);
});
