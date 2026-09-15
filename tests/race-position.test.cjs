const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=html.indexOf('const POSITION_MARK_METRES=5;');
const end=html.indexOf('function raceProgress(){',start);

function world(){
 const n=100,x=new Float64Array(n),z=new Float64Array(n);
 for(let i=0;i<n;i++){const a=i/n*Math.PI*2;x[i]=Math.sin(a)*100;z[i]=Math.cos(a)*100;}
 const ai={n,ds:1,x,z},player={wx:x[98],wz:z[98]};
 const cars=[97,96].map(i=>({i,car:{st:{wx:x[i],wz:z[i]}}}));
 const ctx={AI:ai,TT:{gates:[{x:x[0],z:z[0]}]},SPAWN:{x:x[0],z:z[0]},carState:player,RACE:{},AIS:cars};
 vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);ctx.positionReset();
 return {ctx,cars};
}

test('all cars share the start-line origin so grid order exists before movement',()=>{
 const {ctx,cars}=world();
 assert.equal(ctx.RACE._position.progress,-2);
 assert.equal(cars[0]._position.progress,-3);
 assert.equal(cars[1]._position.progress,-4);
});

test('five-metre markers unwrap at the finish and accept reverse movement',()=>{
 const {ctx}=world(),rec=ctx.RACE._position;
 ctx.positionTrack(rec,3,1);
 assert.equal(rec.progress,3);assert.equal(rec.marker,0);
 ctx.positionTrack(rec,1,2);
 assert.equal(rec.progress,1);assert.equal(rec.i,1);
});

test('reverse has steering authority at one kilometre per hour',()=>{
 assert.match(html,/const yawSpeed=speed<0\?-Math\.max\(Math\.abs\(speed\),2\.8\):speed/);
});
