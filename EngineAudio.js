/* A deliberately small one-loop racing engine. Keep the tuning in one place
   so the sound can be adjusted without touching the driving model. */
class EngineAudio {
  static tuning = {
    idleRPM: 1200,
    maxRPM: 10500,
    shiftUpRPM: 9650,
    shiftDownRPM: 3900,
    minimumPlaybackRate: 0.72,
    maximumPlaybackRate: 1.48,
    throttleVolumeBoost: 0.18,
    baseVolume: 0.46,
    rpmVolumeBoost: 0.18,
    rpmSmoothing: 8.5,
    shiftSpeed: 18,
    playbackSmoothing: 0.055,
    volumeSmoothing: 0.075,
    v10HarmonicVolume: 0.045,
    gearSpeedRangesKph: [
      [0, 55], [34, 96], [64, 142], [104, 194], [148, 252], [188, 360]
    ]
  };

  constructor({src, tuning={}}={}) {
    this.srcUrl=src;
    this.tuning={...EngineAudio.tuning,...tuning};
    this.gears=this.tuning.gearSpeedRangesKph.map(r=>r.slice());
    this.context=null; this.buffer=null; this.source=null;
    this.gain=null; this.filter=null; this.synthGain=null; this.oscillators=[]; this.compressor=null; this.readyPromise=null;
    this.rpm=this.tuning.idleRPM; this.gear=1; this.active=false;
    this.throttle=0; this.speedKph=0; this.shiftDrop=0;
  }

  async unlock(){
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC) return false;
    if(!this.context) this.context=new AC();
    if(this.context.state==='suspended') await this.context.resume();
    if(!this.readyPromise) this.readyPromise=this.load();
    return this.readyPromise;
  }

  async load(){
    try{
      const response=await fetch(this.srcUrl);
      if(!response.ok) throw new Error('engine loop '+response.status);
      this.buffer=await this.context.decodeAudioData(await response.arrayBuffer());
      this.start();
      return true;
    }catch(error){
      console.warn('EngineAudio: unable to load '+this.srcUrl,error);
      return false;
    }
  }

  start(){
    if(!this.context||!this.buffer||this.source) return;
    this.source=this.context.createBufferSource();
    this.source.buffer=this.buffer; this.source.loop=true;
    this.filter=this.context.createBiquadFilter();
    this.filter.type='lowpass'; this.filter.frequency.value=3200; this.filter.Q.value=.35;
    this.gain=this.context.createGain(); this.gain.gain.value=0;
    this.compressor=this.context.createDynamicsCompressor();
    this.compressor.threshold.value=-12; this.compressor.knee.value=18;
    this.compressor.ratio.value=4; this.compressor.attack.value=.008; this.compressor.release.value=.12;
    this.synthGain=this.context.createGain(); this.synthGain.gain.value=0;
    /* A very quiet pair of harmonics gives the short CC0 loop the sharp,
       high-rev V10 edge without adding another sample or changing physics. */
    [1,2].forEach((mult,index)=>{
      const osc=this.context.createOscillator();
      osc.type=index?'square':'sawtooth'; osc.frequency.value=100;
      osc.connect(this.synthGain); osc.start(); this.oscillators.push({osc,mult});
    });
    this.source.connect(this.filter); this.filter.connect(this.gain);
    this.gain.connect(this.compressor); this.synthGain.connect(this.compressor);
    this.compressor.connect(this.context.destination);
    this.source.start();
  }

  setActive(active){ this.active=!!active; }

  mute(){
    this.active=false;
    if(this.gain&&this.context){
      const now=this.context.currentTime;
      this.gain.gain.cancelScheduledValues(now);
      this.gain.gain.setTargetAtTime(0,now,this.tuning.volumeSmoothing);
      if(this.synthGain) this.synthGain.gain.setTargetAtTime(0,now,this.tuning.volumeSmoothing);
    }
  }

  shift(direction){
    this.gear=Math.max(1,Math.min(this.gears.length,this.gear+direction));
    /* A real upshift drops revs before the next ratio starts pulling them up. */
    this.shiftDrop=Math.max(this.shiftDrop,.28);
  }

  targetRPM(){
    const range=this.gears[this.gear-1]||this.gears[0];
    const span=Math.max(1,range[1]-range[0]);
    const ratio=Math.max(0,Math.min(1,(this.speedKph-range[0])/span));
    const throttleRise=this.throttle*520;
    return Math.max(this.tuning.idleRPM, this.tuning.idleRPM+
      ratio*(this.tuning.maxRPM-this.tuning.idleRPM)+throttleRise);
  }

  update(dt,{speed=0,throttle=0,active=true}={}){
    this.setActive(active);
    this.speedKph=Math.max(0,speed*3.6);
    this.throttle=Math.max(0,Math.min(1,throttle?1:0));

    const currentTarget=this.targetRPM();
    const range=this.gears[this.gear-1]||this.gears[0];
    const nextUp=this.gear<this.gears.length && currentTarget>=this.tuning.shiftUpRPM && this.speedKph>=range[1]-2;
    const nextDown=this.gear>1 && this.speedKph<range[0]-7 && currentTarget<=this.tuning.shiftDownRPM;
    if(nextUp) this.shift(1);
    else if(nextDown) this.shift(-1);

    let target=this.targetRPM();
    if(this.shiftDrop>0){
      target*=1-this.shiftDrop*.42;
      this.shiftDrop=Math.max(0,this.shiftDrop-dt*this.tuning.shiftSpeed);
    }
    const rpmK=1-Math.exp(-this.tuning.rpmSmoothing*Math.max(dt,0));
    this.rpm+=(target-this.rpm)*rpmK;
    this.rpm=Math.max(this.tuning.idleRPM,Math.min(this.tuning.maxRPM,this.rpm));

    if(!this.gain||!this.source||!this.context) return;
    const now=this.context.currentTime;
    const norm=Math.max(0,Math.min(1,(this.rpm-this.tuning.idleRPM)/(this.tuning.maxRPM-this.tuning.idleRPM)));
    const rate=this.tuning.minimumPlaybackRate+
      (this.tuning.maximumPlaybackRate-this.tuning.minimumPlaybackRate)*norm;
    const volume=this.active ? this.tuning.baseVolume+
      this.throttle*this.tuning.throttleVolumeBoost+norm*this.tuning.rpmVolumeBoost : 0;
    const harmonicGain=this.active ? this.tuning.v10HarmonicVolume*(0.45+norm*0.9) : 0;
    const cutoff=1100+norm*6000;
    this.source.playbackRate.setTargetAtTime(rate,now,this.tuning.playbackSmoothing);
    this.gain.gain.setTargetAtTime(volume,now,this.tuning.volumeSmoothing);
    this.synthGain.gain.setTargetAtTime(harmonicGain,now,this.tuning.volumeSmoothing);
    const firingHz=Math.max(80,this.rpm/12);
    this.oscillators.forEach(({osc,mult})=>osc.frequency.setTargetAtTime(firingHz*mult,now,.045));
    this.filter.frequency.setTargetAtTime(cutoff,now,.08);
  }
}
