const assert=require('assert');
const test=(name,fn)=>{try{fn();console.log('ok  '+name);}catch(e){console.error('FAIL '+name);throw e;}};
const S=require('../career-season.js');

const start=()=>{const c=S.migrate({});S.begin(c);S.advance(c);return c;};
const practice=c=>{ if(c.weekend.stage!=='practice'){c.weekend.stage='practice';} return c; };

test('turning up still pays once, and only once',()=>{
  const c=practice(start());
  const up0=c.upgradePoints, cr0=c.coins;
  S.lap(c,140);
  assert.equal(c.coins-cr0,250,'first lap pays credits');
  assert.equal(c.upgradePoints-up0,50,'first lap pays 50 UP');
  const up1=c.upgradePoints, cr1=c.coins;
  S.lap(c,141);
  assert.equal(c.coins,cr1,'a second slow lap pays no credits');
  assert.equal(c.upgradePoints,up1,'a second slow lap pays no UP');
});

test('pace pays on a ladder, quickest tier first',()=>{
  const tier=t=>{const c=practice(start());S.lap(c,200);const up=c.upgradePoints;S.lap(c,t);
                 return c.upgradePoints-up;};
  assert.equal(tier(81),0,  '1:21 is outside the ladder');
  assert.equal(tier(79),60, 'under 1:20');
  assert.equal(tier(77),100,'under 1:18');
  assert.equal(tier(75),150,'under 1:16');
  assert.equal(tier(73),220,'under 1:14');
});

test('only an improvement pays, so a tier cannot be farmed',()=>{
  const c=practice(start());
  S.lap(c,200);
  S.lap(c,79);
  const up=c.upgradePoints;
  S.lap(c,79);    assert.equal(c.upgradePoints,up,'the same time again pays nothing');
  S.lap(c,79.5);  assert.equal(c.upgradePoints,up,'a slower lap pays nothing');
  S.lap(c,78.9);  assert.ok(c.upgradePoints>up,'beating it pays again');
});

test('a career best pays on top, and needs something to beat',()=>{
  const c=practice(start());
  c.laps=[];                       // nothing ever set
  S.lap(c,200);
  const up=c.upgradePoints;
  S.lap(c,79);
  assert.equal(c.upgradePoints-up,60,'no career-best bonus without a prior lap');
  assert.equal(c.weekend.lastReward.best,false);

  const d=practice(start());
  d.laps=[{time:74.5,valid:true},{time:200,valid:true}];
  S.lap(d,300);
  const up2=d.upgradePoints;
  S.lap(d,73);
  assert.equal(d.upgradePoints-up2,420,'under 1:14 (220) plus career best (200)');
  assert.equal(d.weekend.lastReward.best,true);
});

test('an invalid lap in the ledger is not a career best to beat',()=>{
  const c=practice(start());
  c.laps=[{time:60,valid:false}];  // a deleted lap
  S.lap(c,200);
  const up=c.upgradePoints;
  S.lap(c,79);
  assert.equal(c.weekend.lastReward.best,false,'no prior VALID lap, so no bonus');
  assert.equal(c.upgradePoints-up,60);
});

test('qualifying laps are not paid',()=>{
  const c=start();
  c.weekend.stage='qualifying';
  const up=c.upgradePoints, cr=c.coins;
  S.lap(c,70);
  assert.equal(c.upgradePoints,up);
  assert.equal(c.coins,cr);
});

test('rewards survive a save and reload',()=>{
  const c=practice(start());
  S.lap(c,200); S.lap(c,75);
  const back=S.migrate(JSON.parse(JSON.stringify(c)));
  const up=back.upgradePoints;
  S.lap(back,75);
  assert.equal(back.upgradePoints,up,'the weekend best came back with it');
});
