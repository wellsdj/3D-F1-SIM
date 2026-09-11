/* Sample-based engine audio. Gear state is cosmetic; it never changes vehicle physics. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EngineSound=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const FADE=.065;
 // Source positions in accel.mp3, in seconds. End points exclude the recorded
 // shift/drop so shifts follow the car's speed rather than a 27-second loop.
 const GEARS=[
  {start:.16,end:2.91,up:90}, {start:2.99,end:3.66,up:135},
  {start:3.75,end:4.56,up:175}, {start:4.66,end:5.65,up:210},
  {start:5.80,end:8.00,up:245}, {start:8.20,end:10.70,up:278},
  {start:10.80,end:15.80,up:308}, {start:16.00,end:23.30,up:370}
 ];
 function trim(buffer){
  const sr=buffer.sampleRate,n=buffer.length,cap=Math.min(n,Math.round(sr*.4)),channels=[];
  for(let c=0;c<buffer.numberOfChannels;c++)channels.push(buffer.getChannelData(c));
  const active=i=>channels.some(d=>Math.abs(d[i])>.003);
  let start=0,end=n;while(start<cap&&!active(start))start++;
  while(end>n-cap&&end>start&&!active(end-1))end--;
  return end-start>sr*.25?{start:start/sr,end:end/sr}:{start:0,end:buffer.duration};
 }
 function level(buffer,start,end,target){
  let square=0,count=0,peak=0;const a=Math.floor(start*buffer.sampleRate),b=Math.floor(end*buffer.sampleRate);
  for(let c=0;c<buffer.numberOfChannels;c++){const d=buffer.getChannelData(c);for(let i=a;i<b;i++){square+=d[i]*d[i];peak=Math.max(peak,Math.abs(d[i]));count++;}}
  return Math.min(8,target/Math.max(.003,Math.sqrt(square/Math.max(1,count))),.8/Math.max(.001,peak));
 }
 function prepare(ctx,buffer,start,end,tailSeconds,target=.12){
  const sr=buffer.sampleRate,a=Math.max(0,Math.floor(start*sr)),b=Math.min(buffer.length,Math.floor(end*sr));
  if(b-a<sr*.1)throw Error('Engine sample region is too short');
  const out=ctx.createBuffer(buffer.numberOfChannels,b-a,sr),duration=(b-a)/sr;
  const tail=Math.min(tailSeconds||0,duration*.8),fade=Math.min(FADE,tail/4),loopStart=duration-tail+fade;
  for(let c=0;c<buffer.numberOfChannels;c++){
   const d=out.getChannelData(c);d.set(buffer.getChannelData(c).subarray(a,b));
   // The last samples crossfade into the head of the sustain region. Looping
   // resumes after that overlap, avoiding both silence and a hard waveform seam.
   if(tail){const length=Math.floor(fade*sr),head=Math.floor((duration-tail)*sr);
    for(let i=0;i<length;i++){const t=(i+1)/length;d[d.length-length+i]=d[d.length-length+i]*(1-t)+d[head+i]*t;}}
  }
  return {buffer:out,duration,loopStart:tail?loopStart:0,loopEnd:duration,loop:!!tail,gain:level(buffer,a/sr,b/sr,target)};
 }
 function buildBank(ctx,buffers){
  const bank={};
  for(const name of ['idle','brake','coast'])if(buffers[name]){
   const t=trim(buffers[name]);
   bank[name]=prepare(ctx,buffers[name],t.start,t.end,name==='coast'?0:name==='brake'?(t.end-t.start)/2:Math.min(2,t.end-t.start),name==='idle'?.075:name==='coast'?.10:.12);
  }
  if(buffers.accel){
   const t=trim(buffers.accel);
   GEARS.forEach((g,i)=>{bank['gear'+i]=prepare(ctx,buffers.accel,Math.max(t.start,g.start),Math.min(t.end,g.end),.55);});
   bank.rev=prepare(ctx,buffers.accel,2.15,2.87,.5,.10);
  }
  return bank;
 }
 class Model{
  constructor(bank){this.bank=bank;this.reset();}
  reset(){this.gear=0;this.mode='silent';this.time=0;this.lastAccel=-Infinity;this.lastAccelGear=-1;this.serial=0;this.cursors=GEARS.map(()=>null);this.coastAge=0;}
  update(input,dt){
   dt=clamp(Number.isFinite(dt)?dt:0,0,.25);this.time+=dt;
   const speed=Math.abs(input.speed||0)*3.6,thr=clamp(Number(input.throttle)||0,0,1),brk=clamp(Number(input.brake)||0,0,1);
   const previousGear=this.gear;
   if(input.gridded)this.gear=0;
   else{
    while(this.gear<GEARS.length-1&&speed>=GEARS[this.gear].up)this.gear++;
    // Hysteresis keeps a brief lift from toggling gears around an upshift speed.
    while(this.gear>0&&speed<GEARS[this.gear-1].up*.84)this.gear--;
   }
   const mode=input.gridded?'idle':speed<1.5?(thr>.04&&!brk?'rev':'idle'):brk>.04?'brake':thr>.04?'accel':'coast';
   const changed=mode!==this.mode,shifted=previousGear!==this.gear;
   if(changed){this.serial++;if(mode==='coast')this.coastAge=0;}
   if(mode==='coast')this.coastAge+=dt;
   let sample=mode,offset=0,rate=1,volume=1;
   if(mode==='accel'){
    sample='gear'+this.gear;const clip=this.bank[sample];
    const low=this.gear?GEARS[this.gear-1].up:0,phase=clamp((speed-low)/(GEARS[this.gear].up-low),0,1);
    rate=.88+phase*.24;volume=.74+.26*thr;
    if(clip){
     const briefLift=this.lastAccelGear===this.gear&&this.time-this.lastAccel<=.8;
     if(shifted||this.cursors[this.gear]==null||(changed&&!briefLift))this.cursors[this.gear]=phase*Math.max(0,clip.duration-.2);
     offset=clamp(this.cursors[this.gear],0,clip.duration-.001);
     let next=offset+dt*rate;if(next>=clip.loopEnd)next=clip.loopStart+(next-clip.loopEnd)%(clip.loopEnd-clip.loopStart);
     this.cursors[this.gear]=next;
    }
    this.lastAccel=this.time;this.lastAccelGear=this.gear;
   }else if(mode==='brake'){
    const clip=this.bank.brake;if(clip)offset=(1-clamp(speed/340,0,1))*clip.duration*.48;
    volume=.8+.2*brk;
   }else if(mode==='rev'){rate=.8+thr*.25;volume=.6+.25*thr;}
   else if(mode==='idle'){volume=.5;}
   this.mode=mode;
   return {mode,sample,gear:this.gear+1,key:mode==='accel'?sample+':'+this.serial:mode+':'+this.serial,offset,rate,volume,coastAge:this.coastAge};
  }
 }
 class Renderer{
  constructor(ctx,bank){
   this.ctx=ctx;this.bank=bank;this.voices=new Set();this.key=null;this.active=null;
   this.master=ctx.createGain();this.master.gain.value=.8;
   this.filter=ctx.createBiquadFilter();this.filter.type='highpass';this.filter.frequency.value=35;
   this.compressor=ctx.createDynamicsCompressor();
   this.compressor.threshold.value=-8;this.compressor.knee.value=6;this.compressor.ratio.value=8;this.compressor.attack.value=.003;this.compressor.release.value=.12;
   this.master.connect(this.filter);this.filter.connect(this.compressor);this.compressor.connect(ctx.destination);
  }
  voice(sample,when,offset,rate,volume,loop){
   const clip=this.bank[sample];if(!clip)return null;
   const src=this.ctx.createBufferSource(),gain=this.ctx.createGain();src.buffer=clip.buffer;src.loop=loop===undefined?clip.loop:loop;
   src.loopStart=clip.loopStart;src.loopEnd=clip.loopEnd;src.playbackRate.setValueAtTime(rate,when);
   const loudness=clip.gain*volume;gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(loudness,when+FADE);
   src.connect(gain);gain.connect(this.master);
   const voice={src,gain,volume:loudness,when,sample,retired:false};this.voices.add(voice);
   src.onended=()=>{src.disconnect();gain.disconnect();this.voices.delete(voice);};
   src.start(when,clamp(offset,0,clip.duration-.001));return voice;
  }
  fade(voice,now,seconds=FADE){
   if(voice.retired&&voice.stopAt<=now+seconds+.005)return;
   voice.retired=true;voice.stopAt=now+seconds+.005;
   const p=voice.gain.gain;
   if(p.cancelAndHoldAtTime)p.cancelAndHoldAtTime(now);else{p.cancelScheduledValues(now);p.setValueAtTime(now<voice.when?0:voice.volume,now);}
   p.linearRampToValueAtTime(0,now+seconds);try{voice.src.stop(now+seconds+.005);}catch(e){}
  }
  apply(plan,now=this.ctx.currentTime){
   if(plan.key===this.key){
    if(this.active&&!this.active.retired&&plan.mode!=='coast'){
     this.active.src.playbackRate.setTargetAtTime(plan.rate,now,.06);
     const volume=this.bank[plan.sample].gain*plan.volume;this.active.gain.gain.setTargetAtTime(volume,now,.04);this.active.volume=volume;
    }return;
   }
   for(const voice of this.voices)this.fade(voice,now);
   this.key=plan.key;
   this.active=this.voice(plan.sample,now,plan.offset,plan.rate,plan.volume);
   if(plan.mode==='coast'){
    const coast=this.bank.coast,brake=this.bank.brake;
    // Schedule on the audio clock, not a frame timer: play the provided coast
    // once, then the entire brake clip at half speed and loop only its latter half.
    if(coast&&brake){
     const end=now+coast.duration;
     if(this.active)this.fade(this.active,end-FADE,FADE);
     this.voice('brake',end-FADE,0,.5,.8,true);
    }else if(!coast&&brake)this.active=this.voice('brake',now,0,.5,.8,true);
   }
  }
  stop(now=this.ctx.currentTime){
   // Includes the coast's future brake source and every outgoing crossfade.
   for(const v of this.voices){v.gain.gain.cancelScheduledValues(now);v.gain.gain.setValueAtTime(0,now);try{v.src.stop(now);}catch(e){}v.src.disconnect();v.gain.disconnect();}
   this.voices.clear();this.key=null;this.active=null;
  }
  dispose(){this.stop();this.master.disconnect();this.filter.disconnect();this.compressor.disconnect();}
 }
 class Player{
  constructor(assets){this.assets=assets;this.context=null;this.renderer=null;this.model=null;this.loading=null;this.silent=true;this.lastTime=null;this.errors=[];}
  unlock(){
   if(!this.context){const AC=typeof window!=='undefined'&&(window.AudioContext||window.webkitAudioContext);if(!AC)return;this.context=new AC();}
   if(this.context.state==='suspended')this.context.resume().catch(()=>{});
   if(!this.loading)this.loading=this.load();
  }
  async load(){
   const buffers={};
   await Promise.all(Object.entries(this.assets).map(async([name,url])=>{
    try{const response=await fetch(url);if(!response.ok)throw Error('HTTP '+response.status);buffers[name]=await this.context.decodeAudioData(await response.arrayBuffer());}
    catch(e){this.errors.push(name+': '+e.message);console.warn('Engine audio unavailable:',name,e.message);}
   }));
   const bank=buildBank(this.context,buffers);this.model=new Model(bank);this.renderer=new Renderer(this.context,bank);
  }
  update(input){
   if(!this.model||!this.renderer||this.context.state!=='running')return;
   const now=this.context.currentTime,dt=this.lastTime==null?0:now-this.lastTime;this.lastTime=now;this.silent=false;
   this.renderer.apply(this.model.update(input,dt),now);
  }
  stop(){if(this.silent)return;this.silent=true;this.lastTime=null;if(this.renderer)this.renderer.stop();if(this.model)this.model.reset();}
  reset(){this.stop();if(this.model)this.model.reset();}
  status(){return {ready:!!this.model,mode:this.model?this.model.mode:'loading',gear:this.model?this.model.gear+1:1,voices:this.renderer?this.renderer.voices.size:0,errors:this.errors.slice()};}
 }
 return {GEARS,FADE,trim,prepare,buildBank,Model,Renderer,Player};
});
