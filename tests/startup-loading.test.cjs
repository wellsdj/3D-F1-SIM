const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

test('startup overlay is non-dismissible and waits for page and asset readiness',()=>{
  assert.match(source,/id="startup-load"[^>]*role="status"/);
  assert.doesNotMatch(source,/id="startup-load"[\s\S]{0,500}<button/i);
  assert.match(source,/if\(!pageDone\|\|!assetsDone\)return;/);
  assert.match(source,/addEventListener\('load',[\s\S]{0,100}startupLoadFinish/);
  assert.match(source,/function ready\(\)\{[^}]*assetsDone=true;[^}]*startupLoadFinish\(\)/);
});
