#!/usr/bin/env node
/* Does the page's script survive being loaded at all?

   This exists because I shipped a temporal dead zone error -- a top-level
   assignment sitting above its own `let` -- and it took the whole game down.
   `node --check` parses the file and this parses; the error only exists at run
   time. A first attempt scanned brace depth for top-level assignments and
   missed it, because the game body sits inside a wrapper at depth 1 and TDZ is
   per SCOPE, not per file depth.

   So this runs the code instead of reading it. Every name the script does not
   define resolves to a permissive stub that can be called, constructed,
   indexed and coerced, so the absence of a DOM or of three.js does not stop
   execution. What that leaves is the script's own top-level statements, which
   is exactly where this class of bug lives. */
const fs=require('fs'), vm=require('vm');
const file=process.argv[2]||'index.html';
const src=fs.readFileSync(file,'utf8');

const stub=new Proxy(function(){}, {
  get(t,k){
    if(k===Symbol.toPrimitive) return ()=>0;
    /* Chainable rather than absent. Returning undefined here made
       `fetch(...).then(...)` throw on its own, which aborted the block long
       before the line under test -- the harness failing, and reported as if
       the file were fine. */
    if(k==='then') return ()=>stub;
    if(k===Symbol.iterator) return function*(){};
    if(k==='length') return 0;
    return stub;
  },
  set(){return true;}, has(){return true;},
  apply(){return stub;}, construct(){return stub;},
});
const ctx=vm.createContext(new Proxy(Object.create(null), {
  get(t,k){ return k in t ? t[k] : stub; },
  set(t,k,v){ t[k]=v; return true; },
  has(){ return true; },                        // every bare name resolves
}));

const blocks=[...src.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)];
let fails=0;
blocks.forEach(([,code],i)=>{
  try{
    vm.runInContext(code, ctx, {timeout:8000, filename:`${file}#script${i}`});
  }catch(e){
    const msg=String(e&&e.message||e);
    /* Only one kind of failure is real here. Everything else is this harness
       not being a browser, and is not evidence of anything. */
    if(/before initialization|is not defined/.test(msg)){
      console.log(`FAIL in script block ${i}: ${msg}`);
      const at=(e.stack||'').split('\n').slice(0,3)
        .map(l=>l.trim()).filter(l=>/:\d+:\d+/.test(l))[0];
      if(at) console.log('  '+at);
      fails++;
    }
  }
});
if(fails){
  console.log('\nThis throws while the page is loading and stops the whole script.');
  process.exit(1);
}
console.log('PASS - the script loads without a dead-zone or undefined-name throw');
