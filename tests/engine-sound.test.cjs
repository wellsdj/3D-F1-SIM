const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Model,Renderer,prepare,FADE}=require('../engine-sound.js');
function bank(){const out={};for(const name of ['idle','rev','brake','coast',...Array.from({length:8},(_,i)=>'gear'+i)])out[name]={duration:4,loopStart:2,loopEnd:4,loop:name!=='coast',gain:1,buffer:{}};return out;}
function input(kmh,throttle=1,brake=0){return {speed:kmh/3.6,throttle,brake};}
test('half-second lift preserves the acceleration cursor in the current gear',()=>{
 const m=new Model(bank());m.update(input(120),.1);const remembered=m.cursors[1];
 for(let i=0;i<5;i++)m.update(input(118,0),.1);
 const resumed=m.update(input(118),.016);
 assert.equal(resumed.gear,2);assert.equal(resumed.offset,remembered);assert.ok(resumed.offset>0);
});
test('gears use hysteresis and downshift when road speed warrants it',()=>{
 const m=new Model(bank());assert.equal(m.update(input(136),.1).gear,3);
 assert.equal(m.update(input(132,0),.1).gear,3);
 assert.equal(m.update(input(110,0),.1).gear,2);
 assert.equal(m.update(input(60),.1).gear,1);
});
test('top gear sustains within its own recording, without replaying launch',()=>{
 const m=new Model(bank());for(let i=0;i<1000;i++){const p=m.update(input(340),.02);assert.equal(p.sample,'gear7');assert.ok(p.offset<4);}
 assert.ok(m.cursors[7]>=2);
});
test('brake takes priority; a stationary car idles and grid revs do not upshift',()=>{
 const m=new Model(bank());assert.equal(m.update(input(150,1,1),.1).mode,'brake');
 assert.equal(m.update(input(0,0),.1).mode,'idle');
 const p=m.update({...input(180),gridded:true},.1);assert.equal(p.gear,1);assert.equal(p.mode,'rev');
});
function context(){
 const param=()=>({value:0,calls:[],setValueAtTime(...a){this.calls.push(['set',...a]);},linearRampToValueAtTime(...a){this.calls.push(['ramp',...a]);},setTargetAtTime(...a){this.calls.push(['target',...a]);},cancelAndHoldAtTime(...a){this.calls.push(['hold',...a]);},cancelScheduledValues(...a){this.calls.push(['cancel',...a]);}});
 const node=()=>({connect(){},disconnect(){this.disconnected=true;}});
 return {currentTime:0,destination:{},sources:[],createGain(){return {...node(),gain:param()};},createBiquadFilter(){return {...node(),frequency:param()};},createDynamicsCompressor(){return {...node(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()};},createBufferSource(){const s={...node(),playbackRate:param(),stops:[],start(...a){this.started=a;},stop(t){this.stops.push(t);}};this.sources.push(s);return s;},createBuffer(channels,length,sampleRate){const data=Array.from({length:channels},()=>new Float32Array(length));return {numberOfChannels:channels,length,sampleRate,duration:length/sampleRate,getChannelData:c=>data[c]};}};
}
test('coasting schedules a single coast then full brake at half speed with a tail loop',()=>{
 const ctx=context(),r=new Renderer(ctx,bank());r.apply({key:'coast:1',mode:'coast',sample:'coast',offset:0,rate:1,volume:1},0);
 assert.equal(ctx.sources.length,2);const brake=ctx.sources[1];
 assert.deepEqual(brake.started,[4-FADE,0]);assert.deepEqual(brake.playbackRate.calls[0],['set',.5,4-FADE]);assert.equal(brake.loop,true);assert.equal(brake.loopStart,2);
 r.apply({key:'coast:1',mode:'coast'},1);assert.equal(ctx.sources.length,2);
});
test('reapplying throttle cancels both the coast and its future brake voice',()=>{
 const ctx=context(),r=new Renderer(ctx,bank());r.apply({key:'coast:1',mode:'coast',sample:'coast',offset:0,rate:1,volume:1},0);
 r.apply({key:'gear2:2',mode:'accel',sample:'gear2',offset:1,rate:1,volume:1},.5);
 assert.ok(ctx.sources[0].stops.at(-1)<.6);assert.ok(ctx.sources[1].stops.at(-1)<.6);
 assert.deepEqual(ctx.sources[2].started,[.5,1]);
 r.stop(.55);assert.equal(r.voices.size,0);for(const s of ctx.sources){assert.equal(s.stops.at(-1),.55);assert.equal(s.disconnected,true);}
});
test('sample preparation makes a latter-half brake loop without modifying the recording',()=>{
 const ctx=context(),source=ctx.createBuffer(1,4000,1000);source.getChannelData(0).fill(.2);
 const before=source.getChannelData(0).slice();const clip=prepare(ctx,source,0,4,2);
 assert.equal(clip.loopStart,2+FADE);assert.equal(clip.loopEnd,4);assert.deepEqual(source.getChannelData(0),before);assert.ok(Number.isFinite(clip.gain));
});
