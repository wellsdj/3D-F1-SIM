/* Apex GP's original racing mix: persistent engine/coast/brake loops with
   smooth volume crossfades. Keep all tuning here so the sound can be adjusted
   without touching the driving model. */
class EngineAudio {
  static tuning={
    engineVolume:0.90, idleVolume:0.35, coastVolume:0.75, brakeVolume:0.85,
    idleSpeedKph:10, lowSpeedKph:70, playbackIdle:0.60,
    playbackMin:0.85, playbackMax:1.50, speedForMaxKph:160,
    fadeInRate:2, fadeOutRate:3, lowSpeedFadeInRate:12,
    brakeLeadSeconds:0.50, coastCornerThreshold:0.038
  };

  constructor({engine,coast,coast2,brake,tuning={}}={}){
    this.tuning={...EngineAudio.tuning,...tuning};
    this.engine=new Audio(engine); this.engine.loop=true; this.engine.volume=0;
    this.coast=new Audio(coast); this.coast.loop=true; this.coast.volume=0;
    this.coast2=new Audio(coast2); this.coast2.loop=true; this.coast2.volume=0;
    this.brake=new Audio(brake); this.brake.loop=true; this.brake.volume=0;
    this.activeCoast=this.coast; this.started=false; this.active=false;
    this.target=''; this.coastTarget=''; this.brakeLead=0;
    this.prevEngine=false; this.prevCoast=false;
    this.loops=[this.engine,this.coast,this.coast2,this.brake];
  }

  unlock(){
    if(!this.started){
      this.started=true;
      this.loops.forEach(s=>s.play().catch(()=>{}));
    }
    return Promise.resolve(true);
  }

  mute(){
    this.active=false;
    this.loops.forEach(s=>{s.volume=0;});
  }

  update(dt,{speed=0,throttle=0,brake=0,curvature=0,active=true}={}){
    this.active=!!active;
    if(!this.active){this.mute();return;}
    this.unlock();
    const t=this.tuning, kph=Math.max(0,speed*3.6);
    const moving=kph>0.4, gas=!!throttle, braking=!!brake;
    const idleZone=kph<t.idleSpeedKph, slowZone=kph<30&&!gas;
    let want='';
    if(moving&&!slowZone&&!idleZone){
      if(braking) want='brake';
      else if(gas) want='engine';
      else want='coast';
    }else if(gas) want=idleZone?'idle':'engine';

    if(want==='brake'&&this.target!=='brake'){
      this.target='brake'; this.brakeLead=t.brakeLeadSeconds;
    }
    if(want!=='brake'){this.target=want;this.brakeLead=0;}
    let current=want;
    if(this.target==='brake'&&this.brakeLead>0){current='coast';this.brakeLead-=dt;}

    const lowSpeedEngine=(want==='engine'||want==='idle')&&kph<t.lowSpeedKph;
    if(want==='engine'||want==='idle') current=want;
    const engineNow=current==='engine'||current==='idle';
    if(engineNow&&!this.prevEngine&&kph<t.lowSpeedKph)this.engine.currentTime=0;
    this.prevEngine=engineNow;

    const coastNow=current==='coast';
    if(coastNow&&!this.prevCoast){
      const next=Math.abs(curvature)>t.coastCornerThreshold?this.coast:this.coast2;
      const other=next===this.coast?this.coast2:this.coast;
      other.volume=0; this.activeCoast=next; this.activeCoast.currentTime=0;
    }
    this.prevCoast=coastNow;

    const targetEngine=current==='engine'?t.engineVolume:current==='idle'?t.idleVolume:0;
    const targetCoast=current==='coast'?t.coastVolume:0;
    const targetBrake=current==='brake'?t.brakeVolume:0;
    const inRate=lowSpeedEngine?dt*t.lowSpeedFadeInRate:dt*t.fadeInRate;
    this.engine.volume=targetEngine>this.engine.volume?Math.min(targetEngine,this.engine.volume+inRate):Math.max(targetEngine,this.engine.volume-dt*t.fadeOutRate);
    this.activeCoast.volume=targetCoast>this.activeCoast.volume?Math.min(targetCoast,this.activeCoast.volume+dt*t.fadeInRate):Math.max(targetCoast,this.activeCoast.volume-dt*t.fadeOutRate);
    const inactive=this.activeCoast===this.coast?this.coast2:this.coast;
    inactive.volume=Math.max(0,inactive.volume-dt*t.fadeOutRate);
    this.brake.volume=targetBrake>this.brake.volume?Math.min(targetBrake,this.brake.volume+dt*t.fadeInRate):Math.max(targetBrake,this.brake.volume-dt*t.fadeOutRate);
    const norm=Math.max(0,Math.min(1,kph/t.speedForMaxKph));
    this.engine.playbackRate=idleZone?t.playbackIdle:t.playbackMin+(t.playbackMax-t.playbackMin)*norm;
  }
}
