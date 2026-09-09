const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');const S=require('../career-season.js');
const fn=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
function setup(){const c=S.migrate({used:true,team:'Test',round:1,rounds:4,coins:1000,table:[{name:'Rival',pace:1,points:0}]});S.begin(c);S.advance(c);S.advance(c);const ctx={CAREER:{active:true},RESULT:{on:true,you:300,rows:[{who:'You',you:true,t:300,total:305},{who:'Rival',t:null}]},RACE:{raceT:301},AIS:[{car:true,on:true,finish:null}],CareerSeason:S,careerSlot:()=>c,careerSave:()=>ctx.saves++,raceResultUI:()=>{},saves:0};vm.createContext(ctx);vm.runInContext(fn('function careerScore(){','function raceResultRows(){'),ctx);return {ctx,c};}
test('classification waits for trailing AI and scores exactly once',()=>{const {ctx,c}=setup();ctx.careerScore();assert.equal(ctx.saves,0);ctx.AIS[0].finish=302;ctx.RESULT.rows=[{who:'Rival',t:302,total:302},{who:'You',you:true,t:300,total:305}];ctx.careerScore();ctx.careerScore();assert.equal(ctx.saves,1);assert.equal(c.last.pos,2);assert.equal(c.points,18);});
test('classification timeout records unfinished AI as DNF',()=>{const {ctx,c}=setup();ctx.RACE.raceT=391;ctx.careerScore();assert.equal(c.table[0].points,0);assert.equal(c.last.rows[1].dnf,true);});
test('practice uses solo timer, race uses existing start sequence',()=>{assert.match(source,/if\(!careerTimedSession\(\)\) raceStart\(\{keepIntro:true\}\)/);assert.match(source,/careerRecordLap\(TT.t\)/);assert.match(source,/order=\(c.weekend && c.weekend.grid\) \|\| field/);});
test('menu CSS does not override race grid slot appearance',()=>{const css=fs.readFileSync(require('node:path').join(__dirname,'../career-menu.css'),'utf8');assert.equal(/(^|})\s*\.slot[:\s{]/.test(css),false);});
test('TV director remains available for replay and spectator presentation',()=>{
  const el={classList:{add(){},remove(){}}};let builds=0;
  const ctx={TTREC:{best:{f:[[0],[10]]}},TT:{live:false},tvCams:[],tvShot:{},tvSeq:7,tvFov:0,CAMS:[{}, {tv:true}],camMode:0,orbit:true,freeLook:true,
    ttBuild(){builds++;ctx.TT.curve={};ctx.TT.len=7000;},tvBuild(){ctx.tvCams=[{}];},updateStatus(){},netLabel(){},replayMetadataBegin(){},replayBtn(){},qualifyingLoadHide(){},document:{body:el,getElementById(){return el;}}};
  vm.createContext(ctx);vm.runInContext(fn('function replayStart(){','/* Stopping a replay'),ctx);ctx.replayStart();
  assert.equal(builds,1);assert.equal(ctx.tvCams.length,1);assert.equal(ctx.camMode,1);assert.equal(ctx.TTREC.playing,true);assert.equal(ctx.tvShot,null);assert.equal(ctx.orbit,false);
});
test('loading screen has no missing video or protected-preview manifest request',()=>{
  assert.doesNotMatch(source,/qualifying-intro\.mp4/);
  assert.doesNotMatch(source,/<link rel="manifest"/);
});
