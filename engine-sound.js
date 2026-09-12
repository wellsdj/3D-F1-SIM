/* Direct recordings with resumable transport. No synthetic gearbox or rev beds. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EngineSound=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const CLIPS={accel:{end:23.4,loop:16.2},brake:{end:5.15,loop:2.8},idle:{end:4.7,loop:.2}};
 // Approximate road-speed positions within the actual acceleration recording.
 // Used on entry/re-entry, not to force repeated cuts while the pedal is held.
 const SPEED_MAP=[[0,0],[100,1.7],[160,3],[220,5],[280,9],[330,16],[370,20]];
 function accelerationOffset(speed){
  for(let i=1;i<SPEED_MAP.length;i++){
   const [b,y]=SPEED_MAP[i],[a,x]=SPEED_MAP[i-1];
   if(speed<=b)return x+(y-x)*clamp((speed-a)/(b-a),0,1);
  }
  return 20;
 }
 function advance(position,seconds,clip){
  position+=seconds;
  return position<clip.end?position:clip.loop+(position-clip.end)%(clip.end-clip.loop);
 }
 class Model{
  constructor(){this.reset();}
  reset(){this.mode='silent';this.key=0;this.cursor=0;this.rate=1;this.time=0;this.saved=null;this.speed=0;this.pending='';this.pendingTime=0;}
  update(input,dt){
   dt=clamp(Number.isFinite(dt)?dt:0,0,.1);this.time+=dt;
   const speed=Math.abs(Number(input.speed)||0)*3.6,thr=clamp(Number(input.throttle)||0,0,1),brake=clamp(Number(input.brake)||0,0,1);
   if(this.mode!=='silent')this.cursor=advance(this.cursor,dt*this.rate,CLIPS[this.mode]);
   let next=input.gridded||speed<1.5?'idle':brake>.04?'brake':thr>(this.mode==='accel'?.03:.08)?'accel':'brake';
   // Ignore one-frame pedal chatter, but apply idle/grid lock immediately.
   if(next!==this.mode&&next!=='idle'&&this.mode!=='silent'){
    if(this.pending!==next){this.pending=next;this.pendingTime=0;}
    this.pendingTime+=dt;
    if(this.pendingTime<.035)next=this.mode;
   }else{this.pending='';this.pendingTime=0;}
   if(next!==this.mode){
    if(this.mode==='accel')this.saved={cursor:this.cursor,speed:this.speed,time:this.time};
    if(next==='accel'){
     const resume=this.saved&&this.time-this.saved.time<=1.5&&Math.abs(speed-this.saved.speed)<=35&&Math.abs(this.saved.cursor-accelerationOffset(speed))<5;
     this.cursor=resume?this.saved.cursor:accelerationOffset(speed);
    }else if(next==='brake')this.cursor=clamp((1-speed/340)*3.8,0,3.8);
    else{this.cursor=0;this.saved=null;}
    this.mode=next;this.key++;this.pending='';this.pendingTime=0;
   }
   // Keep recorded shifts intact. Only a small playback-speed correction is
   // allowed; no per-frame seeking or artificial pitch dips.
   this.rate=this.mode==='accel'?clamp(1+(accelerationOffset(speed)-this.cursor)*.025,.9,1.1):this.mode==='brake'?(brake>.04?1:.85):1;
   this.speed=speed;
   return {key:this.key,mode:this.mode,offset:this.cursor,rate:this.rate,volume:this.mode==='idle'?.6:this.mode==='brake'?.72:.85};
  }
 }
 // Alter only the final 60 ms of each recording to soften its long tail wrap.
 function prepare(ctx,buffer,clip){
  const end=Math.min(clip.end,buffer.duration),loop=Math.min(clip.loop,end-.1);
  const n=Math.floor(end*buffer.sampleRate),fade=Math.min(Math.round(.06*buffer.sampleRate),Math.floor((end-loop)*buffer.sampleRate/4));
  const out=ctx.createBuffer(buffer.numberOfChannels,n,buffer.sampleRate),head=Math.round(loop*buffer.sampleRate)-fade;
  let sum=0,peak=0;
  for(let c=0;c<out.numberOfChannels;c++){
   const d=out.getChannelData(c);d.set(buffer.getChannelData(c).subarray(0,n));
   for(let i=0;i<fade;i++){const t=.5-.5*Math.cos(Math.PI*i/(fade-1));d[n-fade+i]=d[n-fade+i]*(1-t)+buffer.getChannelData(c)[head+i]*t;}
   for(const value of d){sum+=value*value;peak=Math.max(peak,Math.abs(value));}
  }
  const rms=Math.sqrt(sum/(n*out.numberOfChannels));
  const level=clip===CLIPS.idle?.055:clip===CLIPS.brake?.09:.105;
  return {buffer:out,loop,end,gain:rms>1e-8?Math.min(level/rms,.75/peak):1};
 }
 class Renderer{
  constructor(ctx,buffers){
   this.ctx=ctx;this.buffers=buffers;this.voices=new Set();this.current=null;
   this.master=ctx.createGain();this.master.gain.value=.65;
   this.filter=ctx.createBiquadFilter();this.filter.type='highpass';this.filter.frequency.value=55;
   this.limiter=ctx.createDynamicsCompressor();this.limiter.threshold.value=-3;this.limiter.knee.value=2;this.limiter.ratio.value=12;this.limiter.attack.value=.003;this.limiter.release.value=.12;
   this.master.connect(this.filter);this.filter.connect(this.limiter);this.limiter.connect(ctx.destination);
  }
  remove(v){v.source.disconnect();v.gain.disconnect();this.voices.delete(v);if(this.current===v)this.current=null;}
  apply(plan,now=this.ctx.currentTime){
   // Disconnect only after the audio clock reaches the stop time; callers
   // may schedule ahead (including OfflineAudioContext preview rendering).
   for(const v of this.voices)if(v.until<=this.ctx.currentTime)this.remove(v);
   if(!this.current||this.current.key!==plan.key){
    if(this.current){
     const v=this.current,level=v.volume*clamp((now-v.start)/.06,0,1);
     v.gain.gain.cancelScheduledValues(now);v.gain.gain.setValueAtTime(level,now);v.gain.gain.linearRampToValueAtTime(0,now+.06);
     v.until=now+.065;v.source.stop(v.until);this.current=null;
    }
    const clip=this.buffers[plan.mode];if(!clip)return;
    const source=this.ctx.createBufferSource(),gain=this.ctx.createGain();
    source.buffer=clip.buffer;source.loop=true;source.loopStart=clip.loop;source.loopEnd=clip.end;
    const volume=plan.volume*(clip.gain||1);
    source.playbackRate.setValueAtTime(plan.rate,now);gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(volume,now+.06);
    source.connect(gain);gain.connect(this.master);
    const v={source,gain,key:plan.key,start:now,volume,until:Infinity};
    source.onended=()=>this.remove(v);this.voices.add(v);this.current=v;
    source.start(now,Math.min(plan.offset,clip.end-.001));
   }else this.current.source.playbackRate.setValueAtTime(plan.rate,now);
  }
  stop(now=this.ctx.currentTime){
   for(const v of this.voices){v.source.onended=null;v.gain.gain.cancelScheduledValues(now);v.gain.gain.setValueAtTime(0,now);try{v.source.stop(now);}catch(e){}v.source.disconnect();v.gain.disconnect();}
   this.voices.clear();this.current=null;
  }
  dispose(){this.stop();this.master.disconnect();this.filter.disconnect();this.limiter.disconnect();}
 }
 class Player{
  constructor(assets){this.assets=assets;this.context=null;this.renderer=null;this.model=new Model();this.loading=null;this.lastTime=null;this.errors=[];}
  unlock(){
   if(!this.context){const AC=typeof window!=='undefined'&&(window.AudioContext||window.webkitAudioContext);if(!AC)return;this.context=new AC();}
   if(this.context.state==='suspended')this.context.resume().catch(()=>{});
   if(!this.loading)this.loading=this.load();
  }
  async load(){
   const buffers={};
   await Promise.all(Object.entries(this.assets).map(async([name,url])=>{
    try{const r=await fetch(url);if(!r.ok)throw Error('HTTP '+r.status);buffers[name]=prepare(this.context,await this.context.decodeAudioData(await r.arrayBuffer()),CLIPS[name]);}
    catch(e){this.errors.push(name+': '+e.message);console.warn('Engine audio unavailable:',name,e.message);}
   }));
   this.renderer=new Renderer(this.context,buffers);
  }
  update(input){
   if(!this.renderer||this.context.state!=='running')return;
   const now=this.context.currentTime,dt=this.lastTime==null?0:now-this.lastTime;this.lastTime=now;
   this.renderer.apply(this.model.update(input,dt),now);
  }
  stop(){this.lastTime=null;if(this.renderer)this.renderer.stop();this.model.reset();}
  reset(){this.stop();}
  status(){return {ready:!!this.renderer,mode:this.model.mode,offset:this.model.cursor,voices:this.renderer?this.renderer.voices.size:0,errors:this.errors.slice()};}
 }
 return {CLIPS,accelerationOffset,advance,prepare,Model,Renderer,Player};
});
