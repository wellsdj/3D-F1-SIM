/* A rival arriving behind YOU gets a ceiling on its speed. Between themselves
   nothing changes -- that is the whole point of it. */
const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function lift(player){
  const ctx={Math, Infinity};
  const code=[/const DUEL_LOOK=\d+;[\s\S]*?const DUEL_EASE=\d+;/,
              /function aiPlayerCap\(d\)\{[\s\S]*?\n\}/]
    .map(re=>{const m=source.match(re); assert.ok(m,'missing '+re); return m[0];}).join('\n');
  vm.runInNewContext(code+`
    this.aiPlayerCap=aiPlayerCap;
    this.L=DUEL_LOOK; this.B=DUEL_BUFFER; this.E=DUEL_EASE; this.W=DUEL_WIDE;`,
    Object.assign(ctx,{
      carState:{wx:0,wz:0,speed:player.speed},
      PLAYER:{}, RESULT:{on:false}, CRASH:{on:false},
      /* The rival's view of where you are: how far up the road, and how far
         across it. */
      aiRelTo:()=>({gap:player.gap, lat:player.lat||0}),
    }));
  return ctx;
}
const rival=off=>({car:{}, off:off||0});

test('a rival closing on a stopped car is given room to stop in',()=>{
  const ctx=lift({speed:0, gap:60});
  const cap=ctx.aiPlayerCap(rival());
  /* Whatever it could still lose the difference from in the road it has
     left, at the gentle rate it plans for. */
  const want=Math.sqrt(2*ctx.E*(60-ctx.B));
  assert.ok(Math.abs(cap-want)<1e-6, cap+' vs '+want);
  assert.ok(cap*3.6>118 && cap*3.6<130, 'about 125 kph at sixty metres: '+(cap*3.6).toFixed(0));
  /* And it starts easing a long way back rather than at the last moment. */
  const far=lift({speed:0, gap:100}).aiPlayerCap(rival());
  assert.ok(far*3.6<180, 'already capped at a hundred metres: '+(far*3.6).toFixed(0));
});

test('the closer it gets the slower it may be, and at your bumper it is your speed',()=>{
  const at=g=>lift({speed:10, gap:g}).aiPlayerCap(rival());
  const far=at(90), mid=at(40), near=at(12), touching=at(5);
  assert.ok(far>mid && mid>near && near>touching, [far,mid,near,touching].join(' > '));
  /* Never below your speed: it settles behind you rather than stopping. */
  assert.equal(touching, 10);
  assert.equal(at(1), 10);
});

test('it only looks ahead, only nearby, and only at cars lined up with you',()=>{
  assert.equal(lift({speed:0, gap:-20}).aiPlayerCap(rival()), Infinity, 'you are behind it');
  assert.equal(lift({speed:0, gap:400}).aiPlayerCap(rival()), Infinity, 'you are miles up the road');
  /* Alongside is racing, not queuing -- and the window widens with distance,
     because a car far back on another line is still pointed at you. */
  assert.equal(lift({speed:0, gap:20, lat:9}).aiPlayerCap(rival()), Infinity, 'well off to one side');
  assert.ok(lift({speed:0, gap:20, lat:1}).aiPlayerCap(rival())<Infinity, 'right behind');
  assert.ok(lift({speed:0, gap:100, lat:6}).aiPlayerCap(rival())<Infinity,
            'far back and a line across: still pointed at you');
});

test('nothing here applies to the rivals racing each other',()=>{
  /* One call, one car: the player. The obstacle list the rest of aiTraffic
     uses is untouched. */
  const fn=source.match(/function aiPlayerCap\(d\)\{[\s\S]*?\n\}/)[0];
  assert.match(fn,/aiRelTo\(d, carState\.wx, carState\.wz/);
  assert.ok(!/AIS/.test(fn), 'it never looks at another rival');
  /* And it is a ceiling on the pedals, next to the others. */
  assert.match(source,/const you=\(d\.youCap===undefined\)\?Infinity:d\.youCap;/);
  assert.match(source,/cap\?cap\[q\]:Infinity\)\*K, you\)/);
  /* Stuck behind you, it looks further across the road for a way past. */
  assert.match(source,/const stuck=\(d\.youCap!==undefined && d\.youCap<Infinity\);/);
  assert.match(source,/const wide=stuck\?Math\.max\(spread,4\.2\):spread;/);
});
