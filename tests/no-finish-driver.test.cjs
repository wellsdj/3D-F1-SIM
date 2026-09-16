const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','home-apex.css'),'utf8');

test('finishing goes home without a driver celebration screen',()=>{
  assert.doesNotMatch(html,/function celebrate\(|assets\/driver\/driver\.glb|celModel|celebrateAt/);
  assert.doesNotMatch(css,/#celebrate|\.cb-canvas|\.cb-board/);
  assert.match(html,/raceEnd\(\); RESULT\.on=false; goHome\(\);/);
});
