const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
function load(start,end,ctx){vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),ctx);return ctx;}
test('slow AI is removed after ten consecutive seconds; exceeding 30 resets the timer',()=>{
 const ctx=load('function aiSlowRetirement(', 'function aiUnstick(',{RACE:{on:true,phase:'racing'},CollisionPhysics:require('../collision-physics'),aiRetire(d){d.on=false;d.dsq=true;}});
 const d={on:true,car:{st:{speed:5,hdg:0}}};ctx.aiSlowRetirement(d,9);assert.equal(d.on,true);d.car.st.speed=9;ctx.aiSlowRetirement(d,1);assert.equal(d.slowRaceT,0);d.car.st.speed=5;ctx.aiSlowRetirement(d,10);assert.equal(d.dsq,true);
});
test('held and finished cars are exempt from the slow-car rule',()=>{
 const ctx=load('function aiSlowRetirement(', 'function aiUnstick(',{RACE:{on:true,phase:'racing'},CollisionPhysics:require('../collision-physics'),aiRetire(){throw Error('unexpected retirement');}});
 for(const flags of [{hold:true},{finish:100},{react:.3}])ctx.aiSlowRetirement({on:true,...flags,car:{st:{speed:0,hdg:0}}},20);
});
test('finish camera overrides orbit/free-look and builds TV cameras',()=>{
 const ctx=load('function finishCamera(){','function raceResultTick(){',{CAMS:[{}, {tv:true}],camMode:0,orbit:true,freeLook:true,TT:{drone:5,curve:{},len:7000},tvCams:[],tvShot:{},tvSeq:3,document:{body:{classList:{remove(){}}}},tvBuild(){ctx.tvCams.push({});},updateStatus(){}});
 ctx.finishCamera();assert.equal(ctx.camMode,1);assert.equal(ctx.orbit,false);assert.equal(ctx.freeLook,false);assert.equal(ctx.TT.drone,0);assert.equal(ctx.tvCams.length,1);
});
test('retired AI remains in the results behind finishers',()=>{
 const ctx=load('function raceResultRows(){','/* Keeps filling in',{TT:{len:7000},LIMITS:{pen:0,dsq:false},RESULT:{you:100},AIS:[{car:{},on:false,dsq:true,name:'Retired'},{car:{},on:true,name:'Winner',finish:90}],GRID_NAMES:[],raceResultUI(){}});
 ctx.raceResultRows();assert.equal(ctx.RESULT.rows.length,3);assert.equal(ctx.RESULT.rows[0].who,'Winner');assert.equal(ctx.RESULT.rows[2].dsq,true);
});
