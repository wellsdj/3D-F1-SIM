const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
function extract(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));}
function setup(career=false){
 const ctx={CAREER:{active:career},qualifyingLoadEl:{classList:{contains:()=>true}},qualifyingLoadGeneration:1,qualifyingTrackReady:true,qualifyingStartQueued:true,
  qualifyingCancelPending:()=>ctx.stopped++,stopped:0,home:0,hidden:0,focused:0,qualifyingWeatherReset(){},qualifyingLoadHide(){ctx.hidden++;},goHome(){ctx.home++;},bootMsg:{},document:{getElementById:()=>({focus(){ctx.focused++;}})}};
 vm.createContext(ctx);vm.runInContext(extract('function qualifyingLoadCancel(){','qualifyingCancelEl.onclick='),ctx);return ctx;
}
test('quick-play cancellation invalidates pending load and returns home',()=>{const ctx=setup();ctx.qualifyingLoadCancel();assert.equal(ctx.qualifyingLoadGeneration,2);assert.equal(ctx.stopped,1);assert.equal(ctx.home,1);assert.equal(ctx.hidden,1);assert.equal(ctx.qualifyingTrackReady,false);assert.equal(ctx.qualifyingStartQueued,false);assert.equal(ctx.focused,1);});
test('career cancellation is rejected by the handler',()=>{const ctx=setup(true);ctx.qualifyingLoadCancel();assert.equal(ctx.qualifyingLoadGeneration,1);assert.equal(ctx.stopped,0);assert.equal(ctx.home,0);assert.equal(ctx.hidden,0);});
test('cancelled track callbacks cannot build or fail a newer session',()=>{
 let callbacks;const ctx={TRACKS:{spa22:{name:'Spa',glb:'spa.glb'}},pendingReplay:false,window:{},qualifyingLoadGeneration:1,qualifyingLoadShow(){},pickEl:{style:{}},applyTrackConstants(){},bootMsg:{},qualifyingLoadSetStatus(){},self:{},THREE:{GLTFLoader:class{load(...args){callbacks=args;}}},loadTick(){},setInterval:()=>1,clearInterval(){},qualifyingLoadFail(){throw Error('stale failure');}};
 vm.createContext(ctx);vm.runInContext(extract('function startTrack(id, opts){','/* RACE OPENS THE TWO MODES'),ctx);ctx.startTrack('spa22',{race:true});ctx.qualifyingLoadGeneration++;
 callbacks[1]({get scene(){throw Error('stale scene accessed');}});callbacks[2]({get loaded(){throw Error('stale progress accessed');}});callbacks[3](Error('stale request'));
 assert.equal(ctx.bootMsg.textContent,'Loading Spa');
});
