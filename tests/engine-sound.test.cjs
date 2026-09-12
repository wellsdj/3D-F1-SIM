const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Model,Renderer,ANCHORS}=require('../engine-sound.js');
const input=(kmh,throttle=1,brake=0)=>({speed:kmh/3.6,throttle,brake});
const settle=(m,i,n=100)=>{let p;while(n--)p=m.update(i,.02);return p;};
test('grid remains identical idle regardless of either pedal',()=>{
 const m=new Model();settle(m,input(300));
 for(const throttle of [0,.5,1])for(const brake of [0,1]){
  const p=m.update({...input(0,throttle,brake),gridded:true},.02);
  assert.equal(p.mode,'idle');assert.equal(p.gear,1);
  assert.deepEqual(p.layers,[{name:'idle',rate:1,volume:.75}]);
 }
});
test('half-second lift preserves gear and pitch while changing load',()=>{
 const m=new Model(),a=settle(m,input(120)),b=settle(m,input(120,0),25),c=settle(m,input(120));
 assert.equal(a.gear,b.gear);assert.equal(b.gear,c.gear);
 assert.ok(Math.abs(a.hz-b.hz)<.001);assert.ok(b.load<.01);assert.ok(c.load>.99);
});
test('upshift drops pitch; hysteresis prevents gear chatter',()=>{
 const m=new Model(),before=settle(m,input(89));
 const after=settle(m,input(91));assert.equal(after.gear,2);assert.ok(after.hz<before.hz-50);
 assert.equal(m.update(input(85,0),.02).gear,2);
 assert.equal(m.update(input(70,0),.02).gear,1);
 assert.equal(m.update(input(150,1,1),.02).mode,'brake');
});
test('sustained high revs remain stable and every layer matches target pitch',()=>{
 const m=new Model(),first=settle(m,input(340));
 for(let i=0;i<3000;i++){
  const p=m.update(input(340),.02);assert.equal(p.gear,8);
  assert.ok(Math.abs(p.hz-first.hz)<.001);
  assert.ok(p.layers.length<=4);
  for(const l of p.layers)assert.ok(Math.abs(l.rate*ANCHORS[l.name]-p.hz)<.001);
 }
});
test('pedal changes reuse sources; stop disconnects every source; restart works',()=>{
 const param=()=>({value:0,setValueAtTime(){},setTargetAtTime(){},cancelScheduledValues(){}});
 const node=()=>({connect(){},disconnect(){this.disconnected=true;}});
 const ctx={currentTime:0,destination:{},sources:[],createGain(){return {...node(),gain:param()};},createBiquadFilter(){return {...node(),frequency:param()};},createDynamicsCompressor(){return {...node(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()};},createBufferSource(){const s={...node(),playbackRate:param(),start(){this.started=true;},stop(){this.stopped=true;}};this.sources.push(s);return s;}};
 const r=new Renderer(ctx,Object.fromEntries(Object.keys(ANCHORS).map(k=>[k,{duration:2}]))),m=new Model();
 for(let i=0;i<1000;i++)r.apply(m.update(input(120,i%2),.02),i*.02);
 assert.equal(ctx.sources.length,9);
 r.stop();assert.equal(r.voices.size,0);assert.ok(ctx.sources.every(s=>s.stopped&&s.disconnected));
 r.apply(m.update(input(0),.02),21);assert.equal(ctx.sources.length,18);
});
