(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.CollisionPhysics=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const halfWidth=.86,halfLength=2.35,inertia=(halfWidth*halfWidth+halfLength*halfLength)/3;
 const cross=(x,z,nx,nz)=>z*nx-x*nz;
 function axes(s){return [{x:Math.sin(s.hdg),z:Math.cos(s.hdg)},{x:Math.cos(s.hdg),z:-Math.sin(s.hdg)}];}
 function velocity(c){return {x:Math.sin(c.st.hdg)*c.st.speed+(c.bumpX||0),z:Math.cos(c.st.hdg)*c.st.speed+(c.bumpZ||0)};}
 function setVelocity(c,x,z){const f=axes(c.st)[0],v=x*f.x+z*f.z;c.st.speed=Math.max(0,v);c.bumpX=x-f.x*c.st.speed;c.bumpZ=z-f.z*c.st.speed;}
 function support(s,nx,nz){const a=axes(s);let x=s.wx,z=s.wz;for(let i=0;i<2;i++){const dot=a[i].x*nx+a[i].z*nz,k=Math.abs(dot)<1e-7?0:Math.sign(dot)*(i?halfWidth:halfLength);x+=a[i].x*k;z+=a[i].z*k;}return {x,z};}
 function overlap(a,b){
  const aa=axes(a),bb=axes(b),dx=b.wx-a.wx,dz=b.wz-a.wz;let depth=Infinity,normal;
  for(const n of aa.concat(bb)){
   const radius=ax=>halfLength*Math.abs(ax[0].x*n.x+ax[0].z*n.z)+halfWidth*Math.abs(ax[1].x*n.x+ax[1].z*n.z);
   const d=dx*n.x+dz*n.z,p=radius(aa)+radius(bb)-Math.abs(d);if(p<=0)return null;
   if(p<depth){depth=p;const sign=d<0?-1:1;normal={x:n.x*sign,z:n.z*sign};}
  }
  const pa=support(a,normal.x,normal.z),pb=support(b,-normal.x,-normal.z);
  // Midpoint of the overlapping face interval prevents false torque in a centred rear-end hit.
  const tx=-normal.z,tz=normal.x;
  const interval=s=>{const lo=support(s,-tx,-tz),hi=support(s,tx,tz);return [lo.x*tx+lo.z*tz,hi.x*tx+hi.z*tz];};
  const ia=interval(a),ib=interval(b),t=(Math.max(ia[0],ib[0])+Math.min(ia[1],ib[1]))*.5;
  const n=((pa.x+pb.x)*normal.x+(pa.z+pb.z)*normal.z)*.5;
  return {nx:normal.x,nz:normal.z,depth,x:normal.x*n+tx*t,z:normal.z*n+tz*t};
 }
 function impulse(a,b,hit){
  const nx=hit.nx,nz=hit.nz,ra={x:hit.x-a.st.wx,z:hit.z-a.st.wz},rb=b?{x:hit.x-b.st.wx,z:hit.z-b.st.wz}:{x:0,z:0};
  const va=velocity(a),vb=b?velocity(b):{x:0,z:0};
  va.x+=(a.impactYaw||0)*ra.z;va.z-=(a.impactYaw||0)*ra.x;
  if(b){vb.x+=(b.impactYaw||0)*rb.z;vb.z-=(b.impactYaw||0)*rb.x;}
  const closing=(va.x-vb.x)*nx+(va.z-vb.z)*nz;if(closing<=0)return 0;
  const an=cross(ra.x,ra.z,nx,nz),bn=cross(rb.x,rb.z,nx,nz),mass=b?2:1;
  const j=(1+(closing<1?0:.12))*closing/(mass+(an*an+(b?bn*bn:0))/inertia);
  const tx=-nz,tz=nx,at=cross(ra.x,ra.z,tx,tz),bt=cross(rb.x,rb.z,tx,tz);
  const slide=(va.x-vb.x)*tx+(va.z-vb.z)*tz;
  const friction=Math.max(-j*.18,Math.min(j*.18,slide/(mass+(at*at+(b?bt*bt:0))/inertia)));
  // Halve car-to-car impulse and yaw; static barrier impacts keep full response.
  const strength=b?.5:1;
  const ix=(nx*j+tx*friction)*strength,iz=(nz*j+tz*friction)*strength;
  const av=velocity(a);setVelocity(a,av.x-ix,av.z-iz);a.impactYaw=(a.impactYaw||0)-cross(ra.x,ra.z,ix,iz)/inertia;
  if(b){const bv=velocity(b);setVelocity(b,bv.x+ix,bv.z+iz);b.impactYaw=(b.impactYaw||0)+cross(rb.x,rb.z,ix,iz)/inertia;}
  return closing;
 }
 function solve(a,b,respond=true){const hit=overlap(a.st,b.st);if(!hit)return null;hit.closing=respond?impulse(a,b,hit):0;const correction=Math.max(0,hit.depth-.002)*.5;a.st.wx-=hit.nx*correction;a.st.wz-=hit.nz*correction;b.st.wx+=hit.nx*correction;b.st.wz+=hit.nz*correction;return hit;}
 return {halfWidth,halfLength,velocity,setVelocity,support,overlap,impulse,solve};
});
