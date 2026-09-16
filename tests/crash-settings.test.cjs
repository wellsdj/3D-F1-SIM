/* A wheel coming off, the two settings that change a session, and the line
   down the hill from La Source. */
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

/* ------------------------------------------------------------- the crash */
test('a wheel comes off only for a fast enough, tyre-first hit',()=>{
  assert.match(source,/let WHEEL_OFF_WALL=330;/);
  assert.match(source,/let WHEEL_OFF_CAR=250;/);
  /* A wall is judged on your own speed as it arrives, read before the impulse
     takes it away; another car on the difference between the two. */
  assert.match(source,/const arriving=Math\.abs\(st\.speed\)\*3\.6;/);
  assert.match(source,/if\(arriving>WHEEL_OFF_WALL && severity>WHEEL_OFF_MIN && !CRASH\.on\)/);
  assert.match(source,/const diff=Math\.abs\(Math\.abs\(A\.st\.speed\)-Math\.abs\(B\.st\.speed\)\)\*3\.6;/);
  assert.match(source,/if\(diff>WHEEL_OFF_CAR && hit\.closing>WHEEL_OFF_MIN/);
  /* Tyre-first is a distance to a wheel, not a guess from the body. */
  assert.match(source,/const WHEEL_NEAR=0\.85;/);
  assert.match(source,/bd=WHEEL_NEAR\*WHEEL_NEAR/);
  /* And the wheel leaves on the debris physics the wings already use. */
  assert.match(source,/wheels\.splice\(wheels\.indexOf\(best\),1\);/);
  assert.match(source,/DEBRIS\.push\(\{o:best,/);
});

test('the crash keeps the chosen camera until the stopped car has settled',()=>{
  assert.match(source,/const CRASH_STOP_T=2;/);
  assert.match(source,/CRASH\.stopT=kph<2\?CRASH\.stopT\+dt:0;/);
  assert.match(source,/if\(CRASH\.stopT>=CRASH_STOP_T\)/);
  assert.match(source,/camMode=0;orbit=false;freeLook=false;/);
  assert.match(source,/if\(typeof TT!=='undefined'\)\s*TT\.drone=0;/);
  assert.match(source,/if\(!CRASH\.card && CRASH\.noseT>=CRASH_NOSE_T\)crashCard\(\);/);
  /* The card is the helmet, and it asks the two questions it was asked to. */
  assert.match(css,/#crashcard \.cc-helm\{[^}]*assets\/home\/helmet-red\.webp/);
  assert.match(source,/class="cc-go">Restart race</);
  assert.match(source,/class="cc-out">Retire</);
  assert.match(source,/\.cc-go'\)\.onclick=\(\)=>\{ crashEnd\(\); restartCurrentRace\(\); \}/);
  assert.match(source,/\.cc-out'\)\.onclick=\(\)=>\{ crashEnd\(\); goHome\(\); \}/);
  /* And the car is not yours again until you answer it. */
  assert.match(source,/if\(CRASH\.on\)\{ thrMag=0; brkMag=1; want=0; thr=false; brk=true; \}/);
});

test('a detached tyre is restored cleanly for the next restart',()=>{
  assert.match(source,/const wheelDamage=\[\];/);
  assert.match(source,/wheelDamage\.push\(\{wheel:best,parent:best\.parent/);
  assert.match(source,/r\.parent\.add\(r\.wheel\)/);
  assert.match(source,/if\(!wheels\.includes\(r\.wheel\)\)wheels\.push\(r\.wheel\);/);
  assert.match(source,/wheelDamage\.length=0;/);
});

/* ---------------------------------------------------------- track limits */
test('limits can be switched off for races and never for a qualifying time',()=>{
  assert.match(source,/let TRACK_LIMITS_ON=true;/);
  assert.match(source,/if\(!TRACK_LIMITS_ON && RACE\.on\)\{ _tlCounted=true; _tlLock=TL_QUIET; return; \}/);
  /* The off switch is above the offence, not above the off-track clock: going
     off still costs you the time it costs you. */
  const gate=source.indexOf("if(!TRACK_LIMITS_ON && RACE.on)");
  const clock=source.indexOf("if(returnBtn) returnBtn.classList.toggle('urgent'");
  assert.ok(clock>=0 && clock<gate, 'the clock still runs before the switch is read');
  /* And a deleted qualifying lap explains itself. */
  assert.match(source,/limitsSay\('LAP DELETED','track limits cannot be turned off for a qualifying time'\)/);
  /* It survives a reload. */
  assert.match(source,/localStorage\.setItem\(TL_ON_KEY, TRACK_LIMITS_ON\?'1':'0'\)/);
});

test('rival pace is a setting, and moves a running career',()=>{
  assert.match(source,/function apexPaintSettings\(\)\{/);
  assert.match(source,/if\(sec==='settings'\) apexPaintSettings\(\);/);
  assert.match(source,/if\(car\)\{ car\.difficulty=n; careerSave\(\); \}/);
  assert.match(source,/aiSetLevel\(n\);/);
  assert.match(source,/<div class="sctl" id="set-pace">/);
  assert.match(source,/<div class="sctl" id="set-limits">/);
});

/* -------------------------------------------------------- the exit line */
test('the run down from La Source is biased left, and eased in and out',()=>{
  const ctx={Math};
  liftAll([/const T1_EXIT=\{[^}]*\};/, /function aiExitBias\(d\)\{[\s\S]*?\n\}/], ctx,
          `function aiFirstProgress(d){return d.p;}
           function clamp(v,a,b){return v<a?a:v>b?b:v;}
           this.aiExitBias=aiExitBias; this.T1_EXIT=T1_EXIT;`);
  const {aiExitBias, T1_EXIT}=ctx;
  assert.ok(T1_EXIT.metres<0, 'left, not right');
  assert.equal(aiExitBias({p:-10}), 0, 'nothing before the corner');
  assert.equal(aiExitBias({p:T1_EXIT.from}), 0, 'nothing at the start of the window');
  assert.equal(aiExitBias({p:T1_EXIT.to}), 0, 'and nothing at the end of it');
  assert.equal(aiExitBias({p:600}), 0, 'nor anywhere else on the lap');
  assert.ok(Math.abs(aiExitBias({p:T1_EXIT.peak})-T1_EXIT.metres)<1e-9, 'full at the peak');
  /* Monotonic on the way in, so nothing steps sideways. */
  let last=0;
  for(let p=T1_EXIT.from; p<=T1_EXIT.peak; p+=5){
    const v=aiExitBias({p});
    assert.ok(v<=last+1e-9, 'eases in without a step');
    last=v;
  }
  /* And it is applied to the line the cars actually drive. */
  assert.match(source,/const base=\(d\.field\?d\.field\.race\[d\.i\]:0\)\+aiExitBias\(d\);/);
});

test('a big hit is louder than the engine, and the engine makes room for it',()=>{
  assert.match(source,/const CRASH_LOUD_KPH=300;/);
  /* The wall passes how fast you were going, not just how square the hit was. */
  assert.match(source,/crashSound\(severity, arriving\);/);
  assert.match(source,/const fast=clamp\(\(\(\+kph\|\|0\)-CRASH_LOUD_KPH\)\/120,0,1\);/);
  assert.match(source,/g\.gain\.value=0\.12\+hard\*0\.85\+fast\*0\.95;/);
  /* Past one it would clip, so it gets its own limiter rather than a ceiling. */
  assert.match(source,/lim=ctx\.createDynamicsCompressor\(\)/);
  /* And the engine steps out from under it, but only for the big ones. */
  assert.match(source,/if\(fast>0 && engineAudio && typeof engineAudio\.duck==='function'\)/);
});
