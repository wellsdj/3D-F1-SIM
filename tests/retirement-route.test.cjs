const test=require('node:test'),assert=require('node:assert/strict'),R=require('../retirement-route.js');
const line={x:Array.from({length:500},()=>0),z:Array.from({length:500},(_,i)=>i),ds:1};
const surface=(x,z)=>({hit:true,loose:x>15&&x<50&&z>70&&z<150});
test('route follows line forward before turning into gravel',()=>{const r=R.plan(line,{x:0,z:20,speed:10},surface,()=>false);assert.ok(r);assert.ok(r.target.z>70);assert.ok(r.target.x>15);assert.ok(r.points.slice(0,r.exitAt).every(p=>p.x===0));assert.ok(r.points.every((p,i)=>!i||p.z>=r.points[i-1].z));});
test('blocked gravel does not produce a route through barriers',()=>{assert.equal(R.plan(line,{x:0,z:20},surface,(x)=>x>10),null);});
test('no gravel returns controlled-stop fallback',()=>{assert.equal(R.plan(line,{x:0,z:20},()=>({hit:true,loose:false}),()=>false),null);});
