/* Forward-only route to a reachable gravel trap; shared by game and tests. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.RetirementRoute=api;})(typeof window!=='undefined'?window:this,function(){
function plan(line,position,surface,blocked){
 const n=line.x.length,ds=line.ds||1;let start=0,best=Infinity;
 for(let i=0;i<n;i++){const d=(line.x[i]-position.x)**2+(line.z[i]-position.z)**2;if(d<best){best=d;start=i;}}
 const step=Math.max(1,Math.round(12/ds));
 for(let m=Math.ceil(((position.speed||0)**2/30)/ds);m<n;m+=step){
  const i=(start+m)%n,j=(i+Math.round(35/ds))%n,k=(j+1)%n;
  const dx=line.x[k]-line.x[j],dz=line.z[k]-line.z[j],len=Math.hypot(dx,dz)||1;
  for(let off=12;off<=60;off+=4)for(const side of [-1,1]){
   const target={x:line.x[j]+side*off*dz/len,z:line.z[j]-side*off*dx/len};
   const g=surface(target.x,target.z);if(!g.hit||!g.loose)continue;
   if(![-2,0,2].every(a=>[-2,0,2].every(b=>{const q=surface(target.x+a,target.z+b);return q.hit&&q.loose;})))continue;
   const exit=[];let clear=true,prev={x:line.x[i],z:line.z[i]};
   // A smooth lateral merge off the racing line rather than a diagonal shortcut.
   for(let s=1;s<=24;s++){
    const u=s/24,idx=(i+Math.round(35*u/ds))%n,e=u*u*(3-2*u);
    const p={x:line.x[idx]+side*off*dz/len*e,z:line.z[idx]-side*off*dx/len*e};
    const ground=surface(p.x,p.z),heading=Math.atan2(p.x-prev.x,p.z-prev.z);
    if(!ground.hit||blocked(p.x,p.z,heading)){clear=false;break;}exit.push(p);prev=p;
   }
   if(!clear)continue;
   const points=[];for(let a=0;a<=m;a+=Math.max(1,Math.round(3/ds)))points.push({x:line.x[(start+a)%n],z:line.z[(start+a)%n]});
   points.push({x:line.x[i],z:line.z[i]},...exit,target);
   return {points,target,exitAt:points.length-exit.length-1,forward:m*ds};
  }
 }
 return null;
}
return {plan};
});
