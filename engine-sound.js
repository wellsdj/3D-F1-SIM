/* Direct recordings with resumable transport. No synthetic gearbox or rev beds. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EngineSound=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 /* Coasting has its own recordings now: it used to share the braking one, so
    lifting off and standing on the brake sounded identical when they are not
    the same thing at all. Two of them, because an engine falling away from 300
    does not sound like one falling away from 80 -- which is chosen at the
    moment you lift, not continuously, or it would swap notes mid-coast.
    Both loop whole: they are a sustained note, so there is no run-in to skip. */
 const CLIPS={accel:{end:23.4,loop:16.2},brake:{end:5.15,loop:2.8},idle:{end:4.7,loop:.2},
              coastLow:{end:3.55,loop:.35},coastHigh:{end:4.02,loop:.4},
              kerb:{end:7.78,loop:.18}};
 const COAST_HIGH_KPH=250;
 /* Under this, braking sounds like coasting rather than like stopping. */
 const COAST_BRAKE_KPH=60;
 // Approximate road-speed positions within the actual acceleration recording.
 // Used on entry/re-entry, not to force repeated cuts while the pedal is held.
 /* Roughly 1.5 g of deceleration, smoothed. Coasting drag is about 11 kph/s at
   speed and never comes close; gravel is 180 and the brakes more, so both trip
   it comfortably. Set above a one-frame sample jump on purpose -- a gap in the
   timeline is not the car slowing down. */
 const DECEL_KPH_S=55;
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
  reset(){this.mode='silent';this.key=0;this.cursor=0;this.rate=1;this.time=0;this.saved=null;this.speed=0;this.pending='';this.pendingTime=0;this.coast=0;this.dv=0;this.hit=0;this.stopT=0;this.coastClip='coastLow';}
  update(input,dt){
   dt=clamp(Number.isFinite(dt)?dt:0,0,.1);this.time+=dt;
   const speed=Math.abs(Number(input.speed)||0)*3.6,thr=clamp(Number(input.throttle)||0,0,1),brake=clamp(Number(input.brake)||0,0,1);
   if(this.mode!=='silent')this.cursor=advance(this.cursor,dt*this.rate,CLIPS[this.mode]);
   /* WHAT THE CAR IS DOING BEATS WHAT THE PEDALS SAY.

      The mode was chosen from the pedals alone, so a car being dragged down by
      gravel or stopped by a barrier went on playing the acceleration recording
      as long as the throttle was held -- an engine pulling hard while the car
      loses eighty kph. Speed is the first thing asked now: if the car is
      actually being slowed, that is what you hear, whatever your foot is
      doing. Gentle decay from drag is not enough to trigger it; this is the
      rate you only reach in gravel, on the brakes, or against a wall. */
   /* Smoothed over about a tenth of a second. One frame of a big number is
      noise -- a sample gap, a teleport, a test feeding speeds directly. Gravel
      and the brakes hold the figure for as long as they are slowing the car,
      which is the thing worth reacting to. */
   const dvRaw=(speed-this.speed)/Math.max(dt,1e-4);     // kph per second
   this.dv=(this.dv||0)+(dvRaw-(this.dv||0))*Math.min(1,dt/.1);
   /* A barrier is an event, not a rate: by the time it has been smoothed the
      car has already stopped changing speed. The game says when one happened. */
   const impact=clamp(Number(input.impact)||0,0,1);
   if(impact>.02) this.hit=Math.max(this.hit||0,.45);
   else this.hit=Math.max(0,(this.hit||0)-dt);
   const dragged=this.dv < -DECEL_KPH_S || this.hit>0;
   /* Braking and coasting are different things and now sound like it. On the
      brakes -- or being dragged down by gravel or a wall -- is the braking
      recording. Rolling with nothing asked of the engine is a coast, and which
      coast it is was decided when you lifted: above 250 the high one, below it
      the low one. Chosen at the lift rather than every frame, or a car slowing
      through the threshold would change note halfway down. */
   const rolling=!(input.gridded||speed<1.5) && brake<=.04 && !dragged
                 && thr<=(this.mode==='accel'?.03:.08);
   let coastClip=this.coastClip||'coastLow';
   if(rolling && !this.mode.startsWith('coast'))
     coastClip=this.coastClip=(speed>=COAST_HIGH_KPH?'coastHigh':'coastLow');
   /* Braking down to a stop is the same note as rolling to one -- an engine
      idling down, not a car being hauled up from 300. Below this the brake
      recording is the wrong sound, so the coast carries it the rest of the way. */
   const crawling=brake>.04 && speed<COAST_BRAKE_KPH && !dragged;
   if(crawling && !this.mode.startsWith('coast'))
     coastClip=this.coastClip='coastLow';
   /* At walking pace, touch the braking recording for a few frames before the
      stationary sound arrives. That tiny bridge removes the hard timbre cut
      without turning the stop into another audible braking event. */
   if(!input.gridded&&speed<=1.2&&this.speed>1.2)this.stopT=.075;
   let next=input.gridded?'idle':this.stopT>0?'brake':speed<=1.2?'idle':(brake>.04&&!crawling||dragged)?'brake'
           :(rolling||crawling)?coastClip
           :thr>(this.mode==='accel'?.03:.08)?'accel':'brake';
   this.stopT=Math.max(0,(this.stopT||0)-dt);
   // Ignore one-frame pedal chatter, but apply idle/grid lock immediately.
   if(next!==this.mode&&next!=='idle'&&this.mode!=='silent'&&!(this.hit>0)&&!(this.stopT>0)){
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
    else if(next.startsWith('coast'))this.cursor=0;
    else{this.cursor=0;this.saved=null;}
    this.mode=next;this.key++;this.pending='';this.pendingTime=0;this.coast=0;
   }
   /* WHERE THE PITCH IS ALLOWED TO MOVE.

      Under power: nowhere. The acceleration recording already has the engine
      rising through it, so bending the playback rate on top of that was two
      pitch changes fighting, which is the wobble you could hear. It plays at
      the rate it was recorded at.

      On the brakes: nowhere either. It is a steady note being braked into.

      Coasting -- rolling, off the throttle and off the brakes -- is the only
      place it moves, and it moves one way: down. The note sags the way an
      engine does when nothing is driving it, and it sags faster when there is
      less speed holding it up, so a coast from 300 falls slowly and a coast
      from 60 drops away. Which note is sagging is already right: entry into
      this clip is mapped from speed, so high speed starts near the top of the
      recording and low speed starts further down it. */
   if(this.mode.startsWith('coast')){
    /* Down, and only down. The note sags the way an engine does when nothing
       is driving it, faster when there is less speed holding it up, and the
       clip loops underneath so a long coast keeps sagging rather than running
       out of recording. */
    this.coast=(this.coast||0)+dt;
    /* Quicker off the top and further down than it was. */
    const fall=.085+.15*(1-clamp(speed/300,0,1));
    this.rate=clamp(1-this.coast*fall,.62,1);
   }
   else{ this.coast=0; this.rate=1; }
   this.speed=speed;
   const kerb=clamp(Number(input.kerb)||0,0,1),kerbSpeed=clamp(speed/35,0,1);
   return {key:this.key,mode:this.mode,offset:this.cursor,rate:this.rate,
           kerbVolume:kerb*kerbSpeed*.56,kerbRate:.54+.51*clamp(speed/260,0,1),
           volume:this.mode==='idle'?.6:this.mode==='brake'?.72
                 :this.mode.startsWith('coast')?.66:.85};
  }
 }
 // Alter only the final 60 ms of each recording to soften its long tail wrap.
 function prepare(ctx,buffer,clip){
  const end=Math.min(clip.end,buffer.duration),loop=Math.min(clip.loop,end-.1);
  const n=Math.floor(end*buffer.sampleRate);
  /* The tail is crossfaded into the loop point so the wrap is not a click. It
     reads from `loop - fade`, so the fade can never be longer than the loop
     point is deep -- with loop at 0 that read ran off the front of the buffer,
     every sample came back undefined, and the tail of the clip became NaN.
     A NaN tail is silence, which is exactly what a looping coast did after one
     pass. */
  const fade=Math.max(0,Math.min(Math.round(.06*buffer.sampleRate),
                                 Math.floor((end-loop)*buffer.sampleRate/4),
                                 Math.round(loop*buffer.sampleRate)));
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
   this.ctx=ctx;this.buffers=buffers;this.voices=new Set();this.current=null;this.kerbVoice=null;
   this.master=ctx.createGain();this.master.gain.value=.65;
   this.filter=ctx.createBiquadFilter();this.filter.type='highpass';this.filter.frequency.value=55;
   this.limiter=ctx.createDynamicsCompressor();this.limiter.threshold.value=-3;this.limiter.knee.value=2;this.limiter.ratio.value=12;this.limiter.attack.value=.003;this.limiter.release.value=.12;
   this.master.connect(this.filter);this.filter.connect(this.limiter);this.limiter.connect(ctx.destination);
  }
  setMuted(muted,now=this.ctx.currentTime){
   this.muted=!!muted;
   const target=this.muted?0:.65,current=this.master.gain.value;
   this.master.gain.cancelScheduledValues(now);this.master.gain.setValueAtTime(current,now);
   this.master.gain.linearRampToValueAtTime(target,now+.06);
  }
  /* Get out of the way of something louder. A big impact has to be the
     loudest thing in the room, and the honest way to do that is not to push
     the crash past what the output can take but to take the engine down under
     it for a moment and let it come back. */
  duck(amount=.25,seconds=.9,now=this.ctx.currentTime){
   if(this.muted) return 0;
   const full=.65, floor=Math.max(0,Math.min(full,full*amount));
   const g=this.master.gain;
   g.cancelScheduledValues(now);
   g.setValueAtTime(g.value,now);
   g.linearRampToValueAtTime(floor,now+.03);
   g.setValueAtTime(floor,now+Math.max(.05,seconds*.35));
   g.linearRampToValueAtTime(full,now+Math.max(.1,seconds));
   return floor;
  }
  remove(v){v.source.disconnect();v.gain.disconnect();this.voices.delete(v);if(this.current===v)this.current=null;}
  applyKerb(plan,now){
   const clip=this.buffers.kerb,volume=plan.kerbVolume||0;
   if(!clip)return;
   if(!this.kerbVoice&&volume>.005){
    const source=this.ctx.createBufferSource(),gain=this.ctx.createGain();
    source.buffer=clip.buffer;source.loop=true;source.loopStart=clip.loop;source.loopEnd=clip.end;
    source.playbackRate.setValueAtTime(plan.kerbRate||1,now);
    gain.gain.setValueAtTime(0,now);source.connect(gain);gain.connect(this.master);
    source.start(now,clip.loop);this.kerbVoice={source,gain,volume:0};
   }
   const v=this.kerbVoice;if(!v)return;
   const target=volume*(clip.gain||1);
   v.gain.gain.cancelScheduledValues(now);v.gain.gain.setValueAtTime(v.volume,now);
   v.gain.gain.linearRampToValueAtTime(target,now+(target>v.volume?.055:.11));
   v.source.playbackRate.setValueAtTime(plan.kerbRate||1,now);v.volume=target;
  }
  apply(plan,now=this.ctx.currentTime){
   // Disconnect only after the audio clock reaches the stop time; callers
   // may schedule ahead (including OfflineAudioContext preview rendering).
   for(const v of this.voices)if(v.until<=this.ctx.currentTime)this.remove(v);
   if(!this.current||this.current.key!==plan.key){
    if(this.current){
     const v=this.current,fade=v.mode==='idle'&&plan.mode==='accel'?.5:.06;
     const level=v.volume*clamp((now-v.start)/.06,0,1);
     v.gain.gain.cancelScheduledValues(now);v.gain.gain.setValueAtTime(level,now);v.gain.gain.linearRampToValueAtTime(0,now+fade);
     v.until=now+fade+.005;v.source.stop(v.until);this.current=null;
    }
    const clip=this.buffers[plan.mode];if(!clip)return;
    const source=this.ctx.createBufferSource(),gain=this.ctx.createGain();
    source.buffer=clip.buffer;source.loop=true;source.loopStart=clip.loop;source.loopEnd=clip.end;
    const volume=plan.volume*(clip.gain||1),fadeIn=plan.mode==='idle'?.16:.06;
    source.playbackRate.setValueAtTime(plan.rate,now);gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(volume,now+fadeIn);
    source.connect(gain);gain.connect(this.master);
    const v={source,gain,key:plan.key,mode:plan.mode,start:now,volume,until:Infinity};
    source.onended=()=>this.remove(v);this.voices.add(v);this.current=v;
    source.start(now,Math.min(plan.offset,clip.end-.001));
   }else this.current.source.playbackRate.setValueAtTime(plan.rate,now);
   this.applyKerb(plan,now);
  }
  stop(now=this.ctx.currentTime){
   for(const v of this.voices){v.source.onended=null;v.gain.gain.cancelScheduledValues(now);v.gain.gain.setValueAtTime(0,now);try{v.source.stop(now);}catch(e){}v.source.disconnect();v.gain.disconnect();}
   this.voices.clear();this.current=null;
   if(this.kerbVoice){const v=this.kerbVoice;try{v.source.stop(now);}catch(e){}v.source.disconnect();v.gain.disconnect();this.kerbVoice=null;}
  }
  dispose(){this.stop();this.master.disconnect();this.filter.disconnect();this.limiter.disconnect();}
 }
 class Player{
  constructor(assets){this.assets=assets;this.context=null;this.renderer=null;this.model=new Model();this.loading=null;this.lastTime=null;this.errors=[];this.muted=false;}
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
   this.renderer=new Renderer(this.context,buffers);this.renderer.setMuted(this.muted);
  }
  setMuted(muted){this.muted=!!muted;if(this.renderer)this.renderer.setMuted(this.muted);return this.muted;}
  duck(amount,seconds){ return this.renderer?this.renderer.duck(amount,seconds):0; }
  toggleMute(){return this.setMuted(!this.muted);}
  update(input){
   if(!this.renderer||this.context.state!=='running')return;
   const now=this.context.currentTime,dt=this.lastTime==null?0:now-this.lastTime;this.lastTime=now;
   this.renderer.apply(this.model.update(input,dt),now);
  }
  stop(){this.lastTime=null;if(this.renderer)this.renderer.stop();this.model.reset();}
  reset(){this.stop();}
  status(){return {ready:!!this.renderer,muted:this.muted,mode:this.model.mode,offset:this.model.cursor,voices:this.renderer?this.renderer.voices.size:0,errors:this.errors.slice()};}
 }
 return {CLIPS,accelerationOffset,advance,prepare,Model,Renderer,Player};
});
