const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('return control becomes urgent only after three seconds fully off track', () => {
  assert.match(html, /returnBtn\.classList\.toggle\('urgent',_tlOff>=3\)/);
  assert.match(html, /if\(on>0\)\{ _tlOff=0; _tlCounted=false;/);
});

test('return selects the closest racing-line sample and removes speed', () => {
  assert.match(html, /for\(let i=0;i<AI\.n;i\+\+\)/);
  assert.match(html, /carState\.wx=AI\.x\[at\]; carState\.wz=AI\.z\[at\]/);
  assert.match(html, /carState\.speed=0; carState\.n=0; carState\.psi=0/);
});

test('returned car settles under gravity before suspension resumes', () => {
  assert.match(html, /PLAYER\.groundY=floor\+0\.16/);
  assert.match(html, /C\.returnDrop\.vy-=9\.81\*dt/);
  assert.match(html, /if\(C\.groundY<=tgt\).*C\.returnDrop=null/);
});
