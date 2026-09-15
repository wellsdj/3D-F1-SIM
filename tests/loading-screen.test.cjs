/* The session loading screen. The art and the copy are cosmetic, but which
   tips it draws from is not: a dry session must never be told about standing
   water, and a wet one must be told about braking. */
const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

/* Lift the pure parts out of the page and run them on their own. */
function lift(){
  const tips=source.match(/const LOAD_TIPS=\{[\s\S]*?\n\};/);
  const pick=source.match(/function qualifyingTipsFor\(c\)\{[\s\S]*?\n\}/);
  const label=source.match(/function qualifyingTipLabel\(c\)\{[\s\S]*?\n\}/);
  assert.ok(tips&&pick&&label,'loading screen tip code is still in index.html');
  const ctx={Math};
  /* `const` does not land on a VM context's global, so hand it over. */
  vm.runInNewContext(tips[0]+'\n'+pick[0]+'\n'+label[0]+'\nthis.LOAD_TIPS=LOAD_TIPS;',ctx);
  return ctx;
}

test('wet sessions are told about braking and never about dry-line rubber',()=>{
  const {qualifyingTipsFor,LOAD_TIPS}=lift();
  const tips=qualifyingTipsFor({light:'midday',wet:'wet'});
  assert.ok(tips.some(t=>/brak/i.test(t)),'a wet session says something about braking');
  for(const t of tips) assert.ok(LOAD_TIPS.wet.includes(t)||LOAD_TIPS.circuit.includes(t),
    'wet pool is wet tips plus circuit notes only: '+t);
});

test('dry sessions never mention standing water or spray',()=>{
  const {qualifyingTipsFor}=lift();
  const tips=qualifyingTipsFor({light:'midday',wet:'clear'});
  assert.equal(tips.filter(t=>/standing water|spray|in the wet/i.test(t)).length,0);
});

test('night adds its own notes on top of the weather',()=>{
  const {qualifyingTipsFor,LOAD_TIPS}=lift();
  const day=qualifyingTipsFor({light:'midday',wet:'clear'});
  const night=qualifyingTipsFor({light:'night',wet:'clear'});
  assert.equal(night.length,day.length+LOAD_TIPS.night.length);
  for(const t of LOAD_TIPS.night) assert.ok(night.includes(t));
  for(const t of LOAD_TIPS.night) assert.ok(!day.includes(t));
});

test('a random weekend is told it is a gamble, not guessed at',()=>{
  const {qualifyingTipsFor,LOAD_TIPS}=lift();
  const tips=qualifyingTipsFor({light:'midday',wet:'auto'});
  assert.ok(LOAD_TIPS.gamble.every(t=>tips.includes(t)));
});

test('the tip label names the conditions it is drawn from',()=>{
  const {qualifyingTipLabel}=lift();
  assert.match(qualifyingTipLabel({light:'midday',wet:'wet'}),/wet/i);
  assert.match(qualifyingTipLabel({light:'night',wet:'wet'}),/night/i);
  assert.match(qualifyingTipLabel({light:'midday',wet:'clear'}),/dry/i);
  assert.match(qualifyingTipLabel({light:'sunset',wet:'auto'}),/mixed/i);
});

test('circuit loading reports a percentage even when the transfer has no length',()=>{
  /* A compressed or cached response gives the progress event no total, which
     used to leave the screen counting megabytes towards a number the driver
     has no way of knowing. The size is written down for exactly this. */
  assert.match(source,/bytes:22869428/);
  assert.match(source,/const total=\(ev\.lengthComputable&&ev\.total\)\|\|t\.bytes\|\|0;/);
  assert.match(source,/Math\.min\(99,Math\.round\(gotBytes\/total\*100\)\)\+'%'/);
  /* And the rail fills to whatever percentage the line is reporting. */
  assert.match(source,/function loadFill\(what\)\{[\s\S]*?\/\(\\d\+\)\\s\*%\//);
});

test('the screen keeps a way back out, and is the helmet card both times',()=>{
  assert.match(source,/<button id="qualifying-cancel"/);
  assert.match(source,/qualifyingLoadEl\.dataset\.wet=/);
  /* Both overlays carry the same card, and the only picture on it is the
     helmet -- no scenery, no stock hero. */
  assert.equal(source.match(/<div class="loadcard">/g).length,2);
  assert.match(source,/\.loadcard \.lc-helm\{[^}]*assets\/home\/helmet-red\.webp/);
  assert.doesNotMatch(source,/assets\/load\//);
  assert.ok(fs.existsSync(path.join(__dirname,'..','assets','home','helmet-red.webp')));
});
