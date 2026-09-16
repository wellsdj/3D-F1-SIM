const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

test('career colour setup renders the real car with unsaved preview materials',()=>{
  assert.match(source,/class="setup-car gview" aria-label="3D car preview"/);
  assert.match(source,/if\(!apexCarView\(preview,look\)\) preview\.innerHTML=apexCarSide\(look\)/);
  assert.match(source,/function apexCarView\(host,override\)/);
  assert.match(source,/if\(!copies\.has\(m\)\)copies\.set\(m,m\.clone\(\)\)/);
});
