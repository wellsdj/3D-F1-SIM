/* The recorder. What matters is that a take teaches the field only where it
   actually drove, and that nothing it teaches can put a car off the circuit. */
const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

test('L opens it, and it is locked behind a password',()=>{
  assert.match(source,/const TAKES_PASS='wells';/);
  assert.match(source,/if\(input\.value===TAKES_PASS\)\{ takesUnlocked=true;/);
  /* Locked until it is unlocked, every time the page loads. */
  assert.match(source,/let TAKES=\[\], takesOpen=false, takesUnlocked=false/);
  assert.match(source,/if\(ask \|\| !takesUnlocked\)\{/);
});

test('a take is only allowed to teach the stretch it covers',()=>{
  const ctx={Math, Float64Array, Uint8Array};
  const code=[/const TAKE_BRIDGE=\d+;[\s\S]*?\nfunction takeSmooth\(m\)\{[\s\S]*?\n\}/]
    .map(re=>{const m=source.match(re); assert.ok(m,'missing takeSmooth'); return m[0];}).join('\n');
  vm.runInNewContext(code+'\nthis.takeSmooth=takeSmooth; this.BRIDGE=TAKE_BRIDGE;',
                     Object.assign(ctx,{AI:{n:400}}));
  const {takeSmooth, BRIDGE}=ctx;
  const n=400;
  const m={lat:new Float64Array(n), cap:new Float64Array(n), seen:new Uint8Array(n)};
  /* Driven from 100 to 200, and nowhere else. */
  for(let i=100;i<=200;i++){ m.seen[i]=1; m.lat[i]=2; m.cap[i]=40; }
  /* With a ten-station gap in the middle, which is a dropout and not a limit. */
  for(let i=150;i<160;i++){ m.seen[i]=0; m.lat[i]=0; m.cap[i]=0; }
  takeSmooth(m);
  assert.ok(m.seen[155], 'a short gap inside the driven stretch is bridged');
  assert.ok(Math.abs(m.lat[155]-2)<0.5, 'and bridged to the same line: '+m.lat[155]);
  assert.equal(m.seen[300], 0, 'the far side of the lap is not taught');
  assert.equal(m.seen[+BRIDGE+205], 0, 'nor anything past the bridging distance');
  /* Nor the station just past the end: a take is not extrapolated beyond
     where the car actually was, in either direction. */
  assert.equal(m.seen[201], 0, 'nothing past where the lap stopped');
});

test('what a take teaches is bounded by the survey and never stops a car',()=>{
  /* The offset is clamped to the room the survey says is there, less a car's
     width; the speed is a ceiling with a floor under it. */
  assert.match(source,/const room=st \? \(m\.lat\[i\]>=0 \? st\.dR : st\.dL\)-1\.6 : 3;/);
  assert.match(source,/AI\.adj\[i\]=clamp\(m\.lat\[i\], -Math\.max\(0,room\), Math\.max\(0,room\)\);/);
  assert.match(source,/cap\[i\]=m\.seen\[i\] \? Math\.max\(12, m\.cap\[i\]\|\|0\) : Infinity;/);
  /* Untaught stations keep the line they had. */
  assert.match(source,/if\(!m\.seen\[i\]\)\{ AI\.adj\[i\]=0; continue; \}/);
  /* And the cap is a ceiling in the pedals, alongside the others. */
  assert.match(source,/Math\.min\(V\[q\]\*boost\(d,q\), aiFirstLimit\(d,q\),\s*\n\s*cap\?cap\[q\]:Infinity\)\*K/);
});

test('takes can be thrown away, and the field put back as it was',()=>{
  assert.match(source,/function takeDelete\(t\)\{[\s\S]*?TAKES=TAKES\.filter\(r=>r\.t!==t\);/);
  assert.match(source,/function takeClear\(\)\{[\s\S]*?AI\.cap=null;[\s\S]*?AI\.adj\.fill\(0\)/);
  /* A take that is thrown away while it is applied takes its teaching with it. */
  assert.match(source,/if\(takesApplied===t\) takeClear\(\);/);
  /* Only so many are kept. */
  assert.match(source,/while\(TAKES\.length>TAKE_MAX\) TAKES\.pop\(\);/);
});
