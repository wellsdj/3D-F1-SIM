/* Accounts. The parts worth testing are the parts that decide whether
   somebody gets in: how a password is kept, how a recovery code is compared,
   and what counts as a name. None of it touches the database. */
const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path');

let A;
test('load the account function',async()=>{
  ({_test:A}=await import('../api/account.mjs'));
});

test('a password is never stored, only a slow hash of it with its own salt',async()=>{
  const {hash, ITERATIONS}=A;
  assert.ok(ITERATIONS>=200000, 'iterations: '+ITERATIONS);
  const a=hash('correct horse','salt-one');
  const b=hash('correct horse','salt-two');
  assert.notEqual(a,b,'the same password under two salts is two hashes');
  assert.equal(a, hash('correct horse','salt-one'), 'and it is reproducible');
  assert.equal(a.length, 64, 'a 32-byte key in hex');
  assert.ok(!/correct|horse/.test(a), 'nothing of the password survives in it');
  /* The source must never write the password anywhere but through hash(). */
  const src=fs.readFileSync(path.join(__dirname,'..','api','account.mjs'),'utf8');
  assert.doesNotMatch(src,/password\s*\}\)/,'no password in a response body');
  assert.match(src,/pass_hash/);
  assert.doesNotMatch(src,/INSERT INTO players[\s\S]{0,400}\$\{body\.password\}/,
                      'the raw password never reaches a query');
});

test('the comparison is constant time and does not throw on odd input',()=>{
  const {same}=A;
  assert.equal(same('abc','abc'), true);
  assert.equal(same('abc','abd'), false);
  assert.equal(same('abc','abcd'), false, 'different lengths are simply false');
  assert.equal(same('', ''), true);
  assert.equal(same(null, 'x'), false);
});

test('a recovery code is readable, unguessable, and forgiving to type',()=>{
  const {recoveryCode, tidyCode, CODE_ALPHA}=A;
  const code=recoveryCode();
  assert.match(code, /^SLIP(-[A-Z0-9]{4}){3}$/, code);
  /* Nothing in it can be confused when read aloud or written down. */
  assert.ok(!/[O0I1]/.test(code.slice(5)), 'no O, 0, I or 1: '+code);
  /* Twelve characters of a 32-symbol alphabet is 60 bits. */
  assert.equal(CODE_ALPHA.length, 32);
  const seen=new Set();
  for(let i=0;i<500;i++) seen.add(recoveryCode());
  assert.equal(seen.size, 500, 'five hundred codes, no repeats');
  /* Typed back in any shape at all, it is the same code. */
  const tidy=tidyCode(code);
  assert.equal(tidyCode(code.toLowerCase()), tidy);
  assert.equal(tidyCode(code.replace(/-/g,' ')), tidy);
  assert.equal(tidyCode('  '+code+'  '), tidy);
  assert.equal(tidyCode(code.replace(/-/g,'')), tidy);
});

test('names and passwords are checked before anything is written',()=>{
  const {badUsername, badPassword}=A;
  assert.equal(badUsername('wells'), null);
  assert.equal(badUsername('a.b-c_9'), null);
  assert.ok(badUsername('ab'), 'too short');
  assert.ok(badUsername('x'.repeat(21)), 'too long');
  assert.ok(badUsername('wells smith'), 'no spaces');
  assert.ok(badUsername('<script>'), 'nothing that could be markup');
  assert.ok(badUsername(null), 'nothing at all');
  assert.equal(badPassword('eight888'), null);
  assert.ok(badPassword('short'), 'under eight');
  assert.ok(badPassword('x'.repeat(201)), 'absurdly long');
});

test('the function says the same thing whether or not the account exists',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','api','account.mjs'),'utf8');
  /* One message for a missing account and a wrong password, and a decoy hash
     on the missing path so the two take the same time. */
  assert.match(src,/const wrong = \{ error: 'Wrong username or password' \};/);
  assert.match(src,/if \(!p\) \{ hash\(String\(body\.password \|\| ''\), 'decoy'\); return send\(res, 401, wrong\); \}/);
  /* And a database error never reaches the browser. */
  assert.match(src,/console\.error\('account:'/);
  assert.match(src,/error: 'The server could not do that\. Try again\.'/);
});

test('every action past sign-in is authorised by the session, never by a name',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','api','account.mjs'),'utf8');
  for(const action of ['me','save','newcode']){
    const at=src.indexOf(`action === '${action}'`);
    assert.ok(at>0, action+' is handled');
    const body=src.slice(at, at+420);
    assert.match(body,/playerFor\(body\.token\)/, action+' checks the token');
  }
  /* A reset spends the code it used and drops every existing session. */
  assert.match(src,/DELETE FROM sessions WHERE player_id = \$\{p\.id\}/);
});

test('the client mirrors progress and leaves the circuit editors alone',()=>{
  const client=fs.readFileSync(path.join(__dirname,'..','account.js'),'utf8');
  const mine=client.match(/const MINE=\[(.*?)\];/)[1];
  const not=client.match(/const NOT_MINE=\[(.*?)\];/)[1];
  const isMine=new Function('k',`
    const MINE=[${mine}], NOT_MINE=[${not}];
    return MINE.some(re=>re.test(k)) && !NOT_MINE.some(re=>re.test(k));`);
  /* Progress travels. */
  for(const k of ['careerSlots','f1sim.tt.best.spa22','f1sim.tt.history.spa22',
                  'f1sim.car.paint','f1sim.car.style','apex.trackLimits','gfxScale'])
    assert.equal(isMine(k), true, k+' should follow the account');
  /* The circuit does not: it is the same for everybody and it is megabytes. */
  for(const k of ['f1sim.walls.v13','f1sim.surf.bake','f1sim.line.adj','f1sim.tle.v2'])
    assert.equal(isMine(k), false, k+' should stay on the machine');
  /* Nor does the session token itself. */
  assert.equal(isMine('slipstream.session'), false);
});
