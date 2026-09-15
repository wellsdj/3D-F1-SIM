const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
function load(start,end,ctx){vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),ctx);return ctx;}
function rescueCtx(){return load('const AI_STUCK_KPH=', '/* The one place a retirement',{raceFlash(){}});}
function driver(){const car={st:{speed:0,wx:0,wz:0},group:{visible:true}};return {d:{on:true,car,off:1,tries:0,stuckT:0,rescue:null},car};}
test('AI reverses for three seconds after five seconds below 30',()=>{
 const ctx=rescueCtx(),{d,car}=driver();
 assert.equal(ctx.aiUnstick(d,car,4.9),null);
 assert.equal(ctx.aiUnstick(d,car,.1).rev,true);assert.equal(d.tries,1);
 assert.equal(ctx.aiUnstick(d,car,2.9).rev,true);
 assert.equal(ctx.aiUnstick(d,car,.1),null);assert.equal(d.rescue,null);
});
test('two failed recoveries are followed by disqualification',()=>{
 const ctx=rescueCtx(),{d,car}=driver();
 for(let attempt=0;attempt<2;attempt++){
   ctx.aiUnstick(d,car,5);ctx.aiUnstick(d,car,3);
 }
 ctx.aiUnstick(d,car,5);
 assert.equal(d.on,false);assert.equal(d.dsq,true);
});
test('forward speed over 30 resets recovery attempts',()=>{
 const ctx=rescueCtx(),{d,car}=driver();
 ctx.aiUnstick(d,car,5);ctx.aiUnstick(d,car,3);
 car.st.speed=31/3.6;ctx.aiUnstick(d,car,.1);
 assert.equal(d.tries,0);assert.equal(d.stuckT,0);
});
test('held, reacting and finished cars do not start recovery',()=>{
 const ctx=rescueCtx();
 for(const flags of [{hold:true},{finish:100},{react:.3}]){
   const {d,car}=driver();Object.assign(d,flags);
   assert.equal(ctx.aiUnstick(d,car,20),null);assert.equal(d.rescue,null);
 }
});
test('finish camera overrides orbit/free-look and builds TV cameras',()=>{
 const ctx=load('function finishCamera(){','function raceResultTick(){',{CAMS:[{}, {tv:true}],camMode:0,orbit:true,freeLook:true,TT:{drone:5,curve:{},len:7000},tvCams:[],tvShot:{},tvSeq:3,document:{body:{classList:{remove(){}}}},tvBuild(){ctx.tvCams.push({});},updateStatus(){}});
 ctx.finishCamera();assert.equal(ctx.camMode,1);assert.equal(ctx.orbit,false);assert.equal(ctx.freeLook,false);assert.equal(ctx.TT.drone,0);assert.equal(ctx.tvCams.length,1);
});
test('retired AI remains in the results behind finishers',()=>{
 const ctx=load('function raceResultRows(){','/* Keeps filling in',{TT:{len:7000},LIMITS:{pen:0,dsq:false},RESULT:{you:100},AIS:[{car:{},on:false,dsq:true,name:'Retired'},{car:{},on:true,name:'Winner',finish:90}],GRID_NAMES:[],raceResultUI(){}});
 ctx.raceResultRows();assert.equal(ctx.RESULT.rows.length,3);assert.equal(ctx.RESULT.rows[0].who,'Winner');assert.equal(ctx.RESULT.rows[2].dsq,true);
});
