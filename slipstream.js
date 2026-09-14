(function(root, factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.Slipstream=api;
})(typeof self!=='undefined'?self:this, function(){
  const MIN_SPEED=22, NEAR=4.5, FAR=55, MAX_LATERAL=4.2;
  const clamp01=v=>Math.max(0,Math.min(1,v));
  function smoothstep(v){ v=clamp01(v); return v*v*(3-2*v); }

  function strength(follower, leaders){
    if(!follower || follower.speed<MIN_SPEED) return 0;
    const fx=Math.sin(follower.hdg), fz=Math.cos(follower.hdg);
    let best=0;
    for(const lead of leaders||[]){
      if(!lead || lead===follower || lead.speed<MIN_SPEED*0.75) continue;
      const dx=lead.wx-follower.wx, dz=lead.wz-follower.wz;
      const ahead=dx*fx+dz*fz;
      if(ahead<=NEAR || ahead>=FAR) continue;
      const lateral=Math.abs(dx*fz-dz*fx);
      if(lateral>=MAX_LATERAL) continue;
      const heading=Math.cos(lead.hdg-follower.hdg);
      if(heading<0.88) continue;
      const distanceFade=1-smoothstep((ahead-NEAR)/(FAR-NEAR));
      const laneFade=1-smoothstep(lateral/MAX_LATERAL);
      const closingFade=clamp01((lead.speed-follower.speed+18)/18);
      best=Math.max(best,distanceFade*laneFade*heading*closingFade);
    }
    return clamp01(best);
  }

  function smooth(current, target, dt){
    const response=target>current?5.5:2.0;
    return current+(target-current)*(1-Math.exp(-response*Math.max(0,dt)));
  }
  return {strength, smooth, MIN_SPEED, FAR, MAX_LATERAL};
});
