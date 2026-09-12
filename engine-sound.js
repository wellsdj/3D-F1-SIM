/* Continuous cockpit audio. The acoustic gearbox never changes vehicle physics. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EngineSound=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const GEARS=[90,135,175,210,245,278,308,370];
 // Relative harmonic anchors, not measured engine RPM.
 const ANCHORS={idle:151.348,'on-low':186.34588345571004,'on-mid':203.59006948857657,'on-pull':234.06402385432196,'on-high':267.6589218338667,'on-top':295.08209529539073,'off-low':142.617,'off-mid':163.627,'off-high':203.612};
 const ON=['idle','on-low','on-mid','on-pull','on-high','on-top'],OFF=['off-low','off-mid','off-high'];
 function blend(names,hz,weight,layers){
  if(weight<=0)return;
  let a=names[0],b=a;
  if(hz>=ANCHORS[names[names.length-1]])a=b=names[names.length-1];
  else for(let i=1;i<names.length;i++)if(hz<=ANCHORS[names[i]]){a=names[i-1];b=names[i];break;}
  const add=(name,volume)=>{if(volume>0)layers.push({name,rate:clamp(hz/ANCHORS[name],.65,1.7),volume});};
  if(a===b){add(a,weight);return;}
  const t=clamp(Math.log(hz/ANCHORS[a])/Math.log(ANCHORS[b]/ANCHORS[a]),0,1);
  add(a,weight*Math.cos(t*Math.PI/2));add(b,weight*Math.sin(t*Math.PI/2));
 }
 class Model{
  constructor(){this.reset();}
  reset(){this.gear=0;this.hz=ANCHORS.idle;this.load=0;this.shiftLeft=0;this.shift='';this.mode='silent';}
  update(input,dt){
   dt=clamp(Number.isFinite(dt)?dt:0,0,.1);
   const speed=Math.abs(Number(input.speed)||0)*3.6,thr=clamp(Number(input.throttle)||0,0,1),brk=clamp(Number(input.brake)||0,0,1);
   const idle=!!input.gridded||speed<1.5,previous=this.gear;
   if(idle){this.gear=0;this.shiftLeft=0;this.shift='';}
   else{
    while(this.gear<GEARS.length-1&&speed>=GEARS[this.gear])this.gear++;
    while(this.gear>0&&speed<GEARS[this.gear-1]*.82)this.gear--;
    if(this.gear!==previous){this.shift=this.gear>previous?'up':'down';this.shiftLeft=this.shift==='up'?.10:.07;}
   }
   this.mode=idle?'idle':brk>.04?'brake':thr>.04?'accel':'coast';
   const demand=idle||brk>.04?0:thr;
   this.load+=(demand-this.load)*(1-Math.exp(-dt/.085));
   const target=idle?ANCHORS.idle:this.gear===0?ANCHORS.idle+(310-ANCHORS.idle)*clamp(speed/GEARS[0],0,1):clamp(speed/GEARS[this.gear]*310,ANCHORS.idle,330);
   if(idle)this.hz=ANCHORS.idle;
   else this.hz+=(target-this.hz)*(1-Math.exp(-dt/(this.shiftLeft>0?.035:.07)));
   const layers=[];
   if(idle)layers.push({name:'idle',rate:1,volume:.75});
   else{
    const dip=this.shiftLeft>0&&this.shift==='up'?.64:1;
    // Wheels still drive the engine on lift-off. Keep some mechanical high
    // register instead of replacing it entirely with a low-rev decel take.
    // Load changes tone/level, never the speed-derived acoustic RPM.
    const presence=.16+.10*clamp((this.hz-180)/130,0,1);
    blend(ON,this.hz,Math.sqrt(presence+(1-presence)*this.load)*dip,layers);
    blend(OFF,this.hz,Math.sqrt(1-this.load)*.64,layers);
   }
   this.shiftLeft=Math.max(0,this.shiftLeft-dt);
   return {mode:this.mode,gear:this.gear+1,hz:this.hz,load:this.load,layers};
  }
 }
 class Renderer{
  constructor(ctx,buffers){
   this.ctx=ctx;this.buffers=buffers;this.voices=new Map();this.running=false;
   this.master=ctx.createGain();this.master.gain.value=.72;
   this.filter=ctx.createBiquadFilter();this.filter.type='highpass';this.filter.frequency.value=30;
   this.limiter=ctx.createDynamicsCompressor();this.limiter.threshold.value=-3;this.limiter.knee.value=2;this.limiter.ratio.value=12;this.limiter.attack.value=.003;this.limiter.release.value=.12;
   this.master.connect(this.filter);this.filter.connect(this.limiter);this.limiter.connect(ctx.destination);
  }
  start(now,hz){
   if(this.running)return;this.running=true;
   // Continuous beds: changing pedals/gear never restarts a recording.
   for(const [name,buffer] of Object.entries(this.buffers)){
    if(!ANCHORS[name])continue;
    const source=this.ctx.createBufferSource(),gain=this.ctx.createGain();source.buffer=buffer;source.loop=true;source.loopStart=0;source.loopEnd=buffer.duration;
    source.playbackRate.setValueAtTime(hz/ANCHORS[name],now);
    gain.gain.setValueAtTime(0,now);source.connect(gain);gain.connect(this.master);source.start(now);
    this.voices.set(name,{source,gain});
   }
  }
  apply(plan,now=this.ctx.currentTime){
   this.start(now,plan.hz);const wanted=new Map(plan.layers.map(layer=>[layer.name,layer]));
   for(const [name,v] of this.voices){
    const layer=wanted.get(name);
    v.gain.gain.setTargetAtTime(layer?layer.volume:0,now,.025);
    // Silent registers must follow the same phase progression as audible ones.
    // Updating only the audible layer causes beating when its neighbour enters.
    v.source.playbackRate.setTargetAtTime(plan.hz/ANCHORS[name],now,.025);
   }
  }
  stop(now=this.ctx.currentTime){
   for(const {source,gain} of this.voices.values()){
    gain.gain.cancelScheduledValues(now);gain.gain.setValueAtTime(0,now);
    try{source.stop(now);}catch(e){}source.disconnect();gain.disconnect();
   }
   this.voices.clear();this.running=false;
  }
  dispose(){this.stop();this.master.disconnect();this.filter.disconnect();this.limiter.disconnect();}
 }
 class Player{
  constructor(assets){this.assets=assets;this.context=null;this.renderer=null;this.model=new Model();this.loading=null;this.silent=true;this.lastTime=null;this.errors=[];}
  unlock(){
   if(!this.context){const AC=typeof window!=='undefined'&&(window.AudioContext||window.webkitAudioContext);if(!AC)return;this.context=new AC();}
   if(this.context.state==='suspended')this.context.resume().catch(()=>{});
   if(!this.loading)this.loading=this.load();
  }
  async load(){
   const buffers={};
   await Promise.all(Object.entries(this.assets).map(async([name,url])=>{
    try{const r=await fetch(url);if(!r.ok)throw Error('HTTP '+r.status);buffers[name]=await this.context.decodeAudioData(await r.arrayBuffer());}
    catch(e){this.errors.push(name+': '+e.message);console.warn('Engine audio unavailable:',name,e.message);}
   }));
   this.renderer=new Renderer(this.context,buffers);
  }
  update(input){
   if(!this.renderer||this.context.state!=='running')return;
   const now=this.context.currentTime,dt=this.lastTime==null?1/60:now-this.lastTime;this.lastTime=now;this.silent=false;
   this.renderer.apply(this.model.update(input,dt),now);
  }
  stop(){this.silent=true;this.lastTime=null;if(this.renderer)this.renderer.stop();this.model.reset();}
  reset(){this.stop();}
  status(){return {ready:!!this.renderer,mode:this.model.mode,gear:this.model.gear+1,hz:this.model.hz,voices:this.renderer?this.renderer.voices.size:0,errors:this.errors.slice()};}
 }
 return {GEARS,ANCHORS,blend,Model,Renderer,Player};
});
