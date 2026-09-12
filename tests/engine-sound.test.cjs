const {test}=require('node:test'),assert=require('node:assert/strict');
const {Model,Renderer,CLIPS,accelerationOffset,prepare}=require('../engine-sound.js');
const input=(speed,throttle=1,brake=0)=>({speed:speed/3.6,throttle,brake});
const run=(m,i,seconds)=>{let p;for(let t=0;t<seconds;t+=.02)p=m.update(i,.02);return p;};
test('grid always uses idle and never advances acceleration',()=>{
 const m=new Model();run(m,input(200),2);
 for(const throttle of [0,.5,1]){const p=m.update({...input(0,throttle),gridded:true},.02);assert.equal(p.mode,'idle');assert.equal(p.rate,1);assert.equal(m.saved,null);}
});
test('one-second lift resumes the acceleration recording instead of launch',()=>{
 const m=new Model();run(m,input(180),2);run(m,input(180,0),1);
 const remembered=m.saved.cursor,p=run(m,input(175),.04);
 assert.equal(p.mode,'accel');assert.ok(Math.abs(p.offset-remembered)<.04);assert.ok(p.offset>3);
});
test('large speed loss or a long lift selects a speed-appropriate recording position',()=>{
 const m=new Model();run(m,input(300),2);run(m,input(70,0,1),.4);
 const p=run(m,input(70),.04);assert.ok(Math.abs(p.offset-accelerationOffset(70))<.04);
 run(m,input(150,0),3);const q=run(m,input(150),.04);assert.ok(Math.abs(q.offset-accelerationOffset(150))<.04);
});
test('held acceleration plays forward through recorded shifts and repeats only the long tail',()=>{
 const m=new Model();let previous=m.update(input(5),0),wraps=0;
 for(let i=0;i<2000;i++){
  const p=m.update(input(300),.02);
  assert.equal(p.key,previous.key);assert.ok(p.rate>=.9&&p.rate<=1.1);
  if(p.offset<previous.offset){wraps++;assert.ok(p.offset>=CLIPS.accel.loop);}
  previous=p;
 }
 assert.ok(wraps>=1&&wraps<5);
});
test('coasting and braking share transport; pedal chatter does not restart it',()=>{
 const m=new Model();const a=run(m,input(150,0),.1),b=run(m,input(150,0,1),.1);
 assert.equal(a.key,b.key);assert.ok(b.offset>a.offset);assert.equal(b.rate,1);
 const c=m.update(input(150,1),.016);assert.equal(c.key,b.key);
 assert.equal(m.update(input(150,0),.016).key,b.key);
});
function context(){
 const param=()=>({value:0,setValueAtTime(v){this.value=v;},setTargetAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},cancelScheduledValues(){}});
 const node=()=>({connect(){},disconnect(){this.disconnected=true;}});
 return {currentTime:0,destination:{},sources:[],createGain(){return {...node(),gain:param()};},createBiquadFilter(){return {...node(),frequency:param()};},createDynamicsCompressor(){return {...node(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()};},createBufferSource(){const s={...node(),playbackRate:param(),start(t,o){this.offset=o;},stop(){this.stopped=true;}};this.sources.push(s);return s;},createBuffer(c,n,sr){const data=Array.from({length:c},()=>new Float32Array(n));return {numberOfChannels:c,length:n,sampleRate:sr,duration:n/sr,getChannelData:i=>data[i]};}};
}
test('renderer reuses held clip, bounds crossfades, and stops every source',()=>{
 const ctx=context(),bank=Object.fromEntries(Object.entries(CLIPS).map(([k,v])=>[k,{buffer:{},loop:v.loop,end:v.end}]));
 const r=new Renderer(ctx,bank),m=new Model();
 for(let i=0;i<100;i++)r.apply(m.update(input(150),.02),i*.02);
 assert.equal(ctx.sources.length,1);
 for(let i=100;i<1100;i++){ctx.currentTime=i*.02;r.apply(m.update(input(150,Math.floor(i/4)%2),.02),i*.02);assert.ok(r.voices.size<=3);}
 r.stop();assert.equal(r.voices.size,0);assert.ok(ctx.sources.every(s=>s.stopped&&s.disconnected));
});
test('preparation retains the original recording except its final wrap fade',()=>{
 const ctx=context(),b=ctx.createBuffer(1,24000,1000);const d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.sin(i*.1);
 const original=d.slice(),p=prepare(ctx,b,CLIPS.accel);
 assert.equal(p.loop,16.2);assert.equal(p.end,23.4);
 assert.deepEqual(p.buffer.getChannelData(0).slice(0,23340),original.slice(0,23340));assert.deepEqual(d,original);
});
