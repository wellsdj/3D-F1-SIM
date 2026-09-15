const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const code=source.slice(source.indexOf('function limitsGained(){'),source.indexOf('function limitsHit(){'));

function gained(surf){
  const ctx={PLAYER:{surf},BARR_HIT:0,RACE:{pos:1},_tlPosWas:1};
  vm.createContext(ctx);vm.runInContext(code,ctx);
  return ctx.limitsGained();
}

test('gravel is no advantage but grass still counts for track limits',()=>{
  assert.equal(gained({loose:true,grass:false}),false);
  assert.equal(gained({loose:false,grass:true}),true);
});
