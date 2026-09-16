const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

test('career creation configures the team and car without a driver creator',()=>{
  assert.match(source,/const SETUP_STEPS=\['team','colours','engine','badge','season'\];/);
  for(const removed of ['setup-name','career-driver','career-number','driverSVG','SKIN_TONES','HAIR_TONES']){
    assert.equal(source.includes(removed),false,removed+' should not appear in career setup');
  }
  assert.match(source,/c\.driver='Player';/);
  assert.match(source,/careerDraft=\{version:3,driver:'Player',team,number:1,/);
});
