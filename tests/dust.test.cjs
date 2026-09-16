/* Sand and water are not the same thing and can no longer be the same pool:
   gravel is a solid yellow cloud, spray is a thin white mist. */
const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

/* spawnDust, on stub pools, so which pool a plume lands in and what colour it
   is written with can both be read back. */
function lift(){
  const pool=()=>({n:16, head:0, pos:new Float64Array(48), vel:new Float64Array(48),
                   life:new Float64Array(16), max:new Float64Array(16), col:new Float64Array(48)});
  const ctx={Math, Float64Array};
  const hsl=[];
  ctx.DUST_DRY=pool(); ctx.DUST_WET=pool();
  ctx._dustC={r:0,g:0,b:0,
    setHSL(h,s,l){ hsl.push({h,s,l}); this.r=h; this.g=s; this.b=l; }};
  ctx.carGroup={position:{x:0,y:0,z:0}, rotation:{y:0}};
  const m=source.match(/function spawnDust\(speed, from, grass, wet\)\{[\s\S]*?\n\}/);
  assert.ok(m,'spawnDust is still in index.html');
  vm.runInNewContext(m[0]+'\nthis.spawnDust=spawnDust;', ctx);
  return {ctx, hsl};
}

test('water goes in the thin pool and sand in the solid one',()=>{
  const {ctx}=lift();
  ctx.spawnDust(50, null, false, true);          // spray
  assert.equal(ctx.DUST_WET.head,1);
  assert.equal(ctx.DUST_DRY.head,0);
  ctx.spawnDust(50, null, false, false);         // gravel
  ctx.spawnDust(50, null, true,  false);         // grass
  assert.equal(ctx.DUST_DRY.head,2);
  assert.equal(ctx.DUST_WET.head,1,'nothing dry ever lands in the spray pool');
});

test('the two pools are built with the opacity each one needs',()=>{
  const m=source.match(/const DUST_DRY=dustPool\(DUST_N, ([\d.]+), ([\d.]+)\);\s*\nconst DUST_WET=dustPool\(DUST_N, ([\d.]+), ([\d.]+)\);/);
  assert.ok(m,'both pools are still created side by side');
  const [,drySize,dryOp,wetSize,wetOp]=m.map(Number);
  assert.ok(dryOp>=0.85, 'gravel is not see-through: '+dryOp);
  assert.ok(wetOp<=0.6,  'spray still is: '+wetOp);
  assert.ok(drySize>wetSize, 'and sand throws a bigger particle than water');
});

test('sand is warm but only just, and dark enough not to blow out',()=>{
  const {ctx,hsl}=lift();
  ctx.spawnDust(50, null, false, false);
  const sand=hsl[hsl.length-1];
  /* Hue in the warm band -- 0.08 is orange, 0.19 is lime. */
  assert.ok(sand.h>0.09 && sand.h<0.15, 'hue '+sand.h);
  /* A tint and not a colour: enough to read as sand, not enough to read as
     paint, which is what three quarters saturation looked like. */
  assert.ok(sand.s>0.2 && sand.s<0.5, 'a tint, not a colour: '+sand.s);
  /* The renderer is ACES filmic on linear vertex colours, so a "sand" picked
     by eye arrives white. This is the ceiling that keeps any warmth at all. */
  assert.ok(sand.l<=0.58, 'light enough to blow out: '+sand.l);
  /* Grass stays green and dark, and spray stays all but colourless. */
  ctx.spawnDust(50, null, true, false);
  const grass=hsl[hsl.length-1];
  assert.ok(grass.h>0.2 && grass.h<0.32, 'grass hue '+grass.h);
  ctx.spawnDust(50, null, false, true);
  const water=hsl[hsl.length-1];
  assert.ok(water.s<0.1, 'spray has next to no colour in it: '+water.s);
  assert.ok(water.l>0.6, 'and is bright: '+water.l);
});

test('both pools are stepped, and sparks ride the solid one',()=>{
  assert.match(source,/function updateDust\(dt\)\{\s*\n\s*updatePool\(DUST_DRY,false,dt\);\s*\n\s*updatePool\(DUST_WET,true,dt\);/);
  assert.match(source,/function spawnSparks\(x,y,z,power\)\{\s*\n\s*const P=DUST_DRY;/);
  /* And nothing is left reaching for the old single-pool arrays. */
  assert.doesNotMatch(source,/dustPts|dustWet|dustHead|dustLife\[/);
});
