/* Three things that meet at La Source: how early the field gets on the power
   there, whether a barrier somebody drew is one the field knows about, and
   what happens to your car once you have taken the flag. */
const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

/* One script, one context: `let` and `const` are lexical, so pieces lifted in
   separate runs would not be able to see each other. */
function liftAll(res, ctx, tail){
  const code=res.map(re=>{ const m=source.match(re);
    assert.ok(m, 'could not find '+re); return m[0]; }).join('\n');
  vm.runInNewContext(code+'\n'+(tail||''), ctx);
  return ctx;
}

/* ------------------------------------------------------------- turn one */
function firstLimit(){
  /* A stand-in line: progress is the station index, one metre a station. */
  const ctx={Math};
  liftAll([/function aiFirstLimit\(d,q\)\{[\s\S]*?\n\}/], ctx,
          'function aiFirstProgress(d,q){return q;} this.aiFirstLimit=aiFirstLimit;');
  return ctx.aiFirstLimit;
}

test('the turn one cap lets go before the inside kerb, not at the apex',()=>{
  const F=source.match(/t1entry:36, t1exitA:(\d+), t1exitD:(\d+), t1exitFrom:(-?\d+)/);
  assert.ok(F,'the turn one numbers are still where they were');
  const [,exitA,exitD,from]=F.map(Number);
  assert.ok(from<0, 'the exit ramp starts before the apex, not on it');
  assert.ok(exitA>18, 'and it lets the grip profile take over quickly');
  assert.equal(exitD,0);
});

test('the cap is continuous where the entry hands over to the exit',()=>{
  const lim=firstLimit();
  const d={};
  const from=-9;
  const entry=lim(d, from-0.001), exit=lim(d, from+0.001);
  assert.ok(Math.abs(entry-exit)<0.05, `entry ${entry} exit ${exit} must meet`);
  /* And past that point it climbs, so it stops binding rather than holding a
     car to hairpin speed while it is already unwinding the wheel. */
  assert.ok(lim(d, from+20) > lim(d, from+1));
  assert.ok(lim(d, 20) > lim(d, 0));
});

/* --------------------------------------------------- barriers the AI knows */
test('a drawn barrier is room the AI no longer has',()=>{
  const ctx={Math, Float32Array, Float64Array, Map, WALLS:[], AI:null};
  /* A straight line down +x, 40 stations a metre apart. The normal points to
     +z, which is "the right". */
  const n=40;
  const AI={n, ds:1, x:new Float64Array(n), z:new Float64Array(n),
            nx:new Float64Array(n), nz:new Float64Array(n)};
  for(let i=0;i<n;i++){ AI.x[i]=i; AI.z[i]=0; AI.nx[i]=0; AI.nz[i]=1; }
  ctx.AI=AI;
  liftAll([/let AI_WALLROOM=null;/, /const AI_WALL_KEEP=[\d.]+;/,
           /const AI_WALL_REACH=\d+;/,
           /function aiWallRoomBuild\(\)\{[\s\S]*?\n\}/,
           /function aiWallRoom\(i, side\)\{[\s\S]*?\n\}/], ctx,
          'this.aiWallRoomBuild=aiWallRoomBuild; this.aiWallRoom=aiWallRoom;');
  assert.equal(ctx.aiWallRoom(10,1), 99, 'nothing drawn, nothing known');
  ctx.WALLS.push([{x:8,z:3},{x:14,z:3}]);          // 3 m off the line, on the right
  const seen=ctx.aiWallRoomBuild();
  assert.ok(seen>0, 'the wall was filed against the stations it runs beside');
  assert.ok(Math.abs(ctx.aiWallRoom(10,1)-3)<0.2, 'three metres on the right');
  assert.equal(ctx.aiWallRoom(10,-1), 99, 'and nothing at all on the left');
  /* Read a little before the wall too: a line is driven with a lag, so the
     wall twenty metres up the road already counts. */
  assert.ok(ctx.aiWallRoom(2,1)<4, 'the wall ahead is known before reaching it');
});

test('a wall drawn by hand survives the mis-trace rule, and survives a save',()=>{
  /* The rule that throws away a traced "wall" lying along the road must not
     throw away one somebody drew there deliberately. */
  assert.match(source,/if\(near && !line\.hand\)\{/);
  assert.match(source,/wallDraw\.hand=true;/);
  const ctx={JSON, Array, WALLS:[]};
  const hand=[{x:1,z:2},{x:3,z:4}]; hand.hand=true;
  ctx.WALLS.push(hand, [{x:9,z:9},{x:8,z:8}]);
  liftAll([/function wallsPack\(\)\{[\s\S]*?\n\}/,
           /function wallsUnpack\(txt\)\{[\s\S]*?\n\}/], ctx,
          'this.wallsPack=wallsPack; this.wallsUnpack=wallsUnpack;');
  const packed=ctx.wallsPack();
  ctx.WALLS.length=0;
  assert.equal(ctx.wallsUnpack(packed), true);
  assert.equal(ctx.WALLS.length, 2);
  assert.equal(ctx.WALLS[0].hand, true, 'still hand-drawn after a reload');
  assert.equal(ctx.WALLS[1].hand, undefined);
  assert.equal(ctx.WALLS[0][1].x, 3);
});

test('G draws barriers again, whenever the circuit is up',()=>{
  assert.match(source,/if\(k==='g' && FREEROAM && !TTREC\.playing && !NET\.watching\)\{/);
  assert.doesNotMatch(source,/if\(k==='g' && EDITOR_KEYS/);
  /* The line editor stays off the keyboard: only the barrier tool came back. */
  assert.match(source,/if\(k==='l' && EDITOR_KEYS/);
});

/* ------------------------------------------------------------- the takeover */
test('the takeover keeps racing at normal AI pace after the flag',()=>{
  assert.match(source,/const p=aiPedals\(d, C\);[\s\S]*?return \{ thr:p\.thr, brk:p\.brk, steer:aiSteer\(d, C, dt\) \};/);
  assert.doesNotMatch(source,/COOL_RACE_T|COOL_PARK_OFF|COOL_PULL_RATE|COOL_STOP_V/);
  assert.doesNotMatch(source,/const cap=100\/3\.6/);
  const cool=source.match(/function coolInputs\(dt\)\{[\s\S]*?\n\}\nfunction coolStep/)[0];
  assert.doesNotMatch(cool,/rev:/);
});

test('the opening hairpin uses compact passing offsets',()=>{
  assert.match(source,/const spread=\(first>-90&&first<120\)\?1\.1:2\.5;/);
  assert.match(source,/base-spread,base\+spread/);
});
