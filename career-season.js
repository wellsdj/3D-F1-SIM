/* Persistent career rules. No rendering or driving code lives in this module. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.CareerSeason=api;})(typeof window!=='undefined'?window:this,function(){
'use strict';
const POINTS=[25,18,15,12,10,8,6,4,2,1];
const EVENTS=['Opening Grand Prix','Ardennes Trophy','Forest Challenge','Summer Grand Prix','Endurance Weekend','Twilight Trophy','Championship Run','Season Finale'];
const CONDITIONS=['midday','sunset','midday','night','sunset','night','midday','sunset'];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
function migrate(c){
 const oldVersion=c.version||0;
 c.version=3;c.season=Math.max(1,Number(c.season)||1);c.driver=String(c.driver||'Your driver').slice(0,24);c.number=clamp(c.number||27,1,99);
 c.rounds=[4,8].includes(c.rounds)?c.rounds:8;c.round=clamp(c.round||1,1,c.rounds+1);
 c.power=clamp(c.power,0,5);c.aero=clamp(c.aero,0,5);c.points=Math.max(0,Number(c.points)||0);c.coins=Math.max(0,Number(c.coins)||0);
 c.reputation=clamp(c.reputation,0,100);
 if(oldVersion<3&&c.difficulty!==undefined)c.difficulty=c.difficulty<=5?1:c.difficulty<=7?2:c.difficulty-5;
 c.difficulty=Math.round(clamp(c.difficulty===undefined?2:c.difficulty,1,5));
 c.upgradePoints=c.upgradePoints===undefined?500:Math.max(0,Number(c.upgradePoints)||0);c.laps=Array.isArray(c.laps)?c.laps:[];c.history=Array.isArray(c.history)?c.history:[];c.archive=Array.isArray(c.archive)?c.archive:[];
 c.contract=c.contract||{name:'Academy',target:8,bonus:500};
 c.weekend=c.weekend&&c.weekend.round===c.round?c.weekend:{round:c.round,stage:'briefing',practice:[],qualifying:[],grid:null};
 if(!['briefing','practice','qualifying','race','debrief'].includes(c.weekend.stage))c.weekend.stage='briefing';
 c.weekend.practice=Array.isArray(c.weekend.practice)?c.weekend.practice:[];c.weekend.qualifying=Array.isArray(c.weekend.qualifying)?c.weekend.qualifying:[];
 return c;
}
function event(c){const i=c.rounds===4?(c.round-1)*2:c.round-1;return {name:EVENTS[i]||'Season complete',lighting:CONDITIONS[i]||'midday',track:'Ardennes Circuit',round:c.round};}
function begin(c){migrate(c);if(c.round>c.rounds)return false;if(c.weekend.stage==='briefing')c.weekend.stage='practice';return true;}
/* WHAT A PRACTICE LAP IS WORTH.
   Turning up paid 250 credits and 50 UP for the first lap and nothing after
   that, so practice was one installation lap and back to the garage. Pace pays
   now, on a ladder that starts at 1:20 -- and only when you actually improve
   on your own best of the weekend, so it rewards finding time rather than
   circulating at the same speed until the tiers have been farmed. */
const PRACTICE_TIERS=[[74,220],[76,150],[78,100],[80,60]];
const CAREER_BEST_UP=200;
/* The quickest valid lap this career has ever set, in any session, with one
   instance of `exclude` skipped -- the lap being scored is already in the
   ledger by the time this runs, and a lap cannot beat itself. */
function bestEver(c,exclude){
 let best=null,skipped=false;
 for(const l of (c.laps||[])){
  if(!l||!l.valid||!Number.isFinite(l.time))continue;
  if(!skipped&&Math.abs(l.time-exclude)<1e-9){skipped=true;continue;}
  if(best===null||l.time<best)best=l.time;
 }
 return best;
}
function lap(c,time){migrate(c);const w=c.weekend;if(!Number.isFinite(time)||time<=0||!['practice','qualifying'].includes(w.stage))return false;
 w[w.stage].push(time);
 if(w.stage!=='practice')return true;
 const award={up:0,cr:0,best:false,tier:0,why:[]};
 if(w.practice.length===1){c.coins+=250;award.cr=250;award.up+=50;award.why.push('Clean practice lap');w.practiceReward=250;}
 /* Only an improvement pays. */
 if(w.practiceBest===undefined||time<w.practiceBest){
  w.practiceBest=time;
  const tier=PRACTICE_TIERS.find(t=>time<t[0]);
  if(tier){award.up+=tier[1];award.tier=tier[0];award.why.push('Under '+Math.floor(tier[0]/60)+':'+String(Math.round(tier[0]%60)).padStart(2,'0'));}
  /* A career best needs something to have beaten: the first lap of a career
     is not an achievement, it is the only data point. */
  const prior=bestEver(c,time);
  if(prior!==null&&time<prior){award.up+=CAREER_BEST_UP;award.best=true;award.why.push('Career best lap');}
 }
 if(award.up)c.upgradePoints+=award.up;
 w.lastReward=award.up||award.cr?award:null;
 return true;}
function qualify(c){const w=c.weekend;const best=Math.min(...w.qualifying);const base=Math.min(...w.practice,126);
 // Rival lap times are simulated from the existing team pace, consistently for this weekend.
 const field=(c.table||[]).map((t,i)=>({ai:i,pace:t.pace,time:base*(1+(1-t.pace)*.16)+(c.difficulty-5)*-.6+((c.season*13+c.round*7+i*11)%17)/10}));
 field.push({ai:-1,pace:.71+(c.power+c.aero)*.031,time:best});field.sort((a,b)=>a.time-b.time||a.ai-b.ai);
 w.grid=field;w.gridPosition=field.findIndex(x=>x.ai===-1)+1;return field;
}
function advance(c){migrate(c);const w=c.weekend;
 if(w.stage==='practice'){w.stage='qualifying';return simulateQualifying(c);}
 if(w.stage==='qualifying')return simulateQualifying(c);
 if(w.stage==='debrief'){c.round++;c.weekend={round:c.round,stage:'briefing',practice:[],qualifying:[],grid:null};return true;}return false;
}
function score(c,rows){migrate(c);const w=c.weekend;if(w.stage!=='race'||w.scored||!rows.some(r=>r.you))return false;
 const mine=rows.findIndex(r=>r.you),me=rows[mine];const pts=me.dsq||me.dnf?0:(POINTS[mine]||0);
 rows.forEach((r,i)=>{if(r.you)c.points+=pts;else{const t=(c.table||[]).find(t=>t.name===r.who);if(t)t.points+=r.dsq||r.dnf?0:(POINTS[i]||0);}});
 const prize=Math.round(2600*Math.pow(.88,mine))+300;const objective=!me.dsq&&!me.dnf&&mine+1<=c.contract.target;const bonus=objective?c.contract.bonus:0;
 const upgradePoints=me.dsq||me.dnf?0:80+(10-mine)*25+(objective?50:0);
 c.upgradePoints+=upgradePoints;c.coins+=prize+bonus;c.reputation=clamp(c.reputation+(objective?8:2)-(me.dsq?5:0),0,100);
 c.last={season:c.season,round:c.round,pos:mine+1,points:pts,prize,bonus,upgradePoints,objective,dsq:!!me.dsq,dnf:!!me.dnf,grid:w.gridPosition||10,rows:rows.map(r=>({who:r.who,you:!!r.you,dsq:!!r.dsq,dnf:!!r.dnf,total:r.total||null}))};
 c.history.push(c.last);w.scored=true;w.stage='debrief';return true;
}
function standings(c){return [...(c.table||[]).map(t=>({...t,you:false})),{name:c.team,points:c.points,you:true}].sort((a,b)=>b.points-a.points||countback(c,a,b));}
function countback(c,a,b){for(let pos=1;pos<=10;pos++){const count=r=>c.history.filter(h=>h.season===c.season&&(h.rows||[])[pos-1]&&((h.rows[pos-1].you&&r.you)||(!r.you&&h.rows[pos-1].who===r.name))).length;const d=count(b)-count(a);if(d)return d;}return 0;}
function nextSeason(c,contract,newTable){if(c.round<=c.rounds)return false;const rank=standings(c).findIndex(r=>r.you)+1;
 c.archive.push({season:c.season,points:c.points,rank,team:c.team});c.season++;c.round=1;c.points=0;c.last=null;c.table=newTable;c.contract=contract;
 c.weekend={round:1,stage:'briefing',practice:[],qualifying:[],grid:null};return true;}
function recordLap(c,time,valid,reason,session){migrate(c);if(!Number.isFinite(time)||time<=0)return false;c.laps.push({season:c.season,round:c.round,session:session||c.weekend.stage,time,valid:!!valid,reason:reason||'',at:Date.now()});return true;}
function simulateQualifying(c,random=Math.random){
 migrate(c);const w=c.weekend;if(w.stage!=='qualifying')return false;
 const power=[0,.02,.04,.07,.10,.14],aero=[0,.02,.05,.08,.12,.17];
 const pace=.78+power[c.power]+aero[c.aero];
 const draw=()=>clamp(random(),0,1)-.5;
 const field=(c.table||[]).map((t,i)=>({ai:i,pace:t.pace,time:126+(1-t.pace)*18+(c.difficulty-1)*-.7+draw()*5}));
 field.push({ai:-1,pace,time:126+(1-pace)*18+draw()*6});
 w.grid=field.sort((a,b)=>a.time-b.time||a.ai-b.ai);w.gridPosition=w.grid.findIndex(r=>r.ai===-1)+1;
 w.simulated=true;w.stage='race';return true;
}
function buyUpgrade(c,kind,level,cost){migrate(c);if(!['power','aero'].includes(kind)||level!==c[kind]+1||level>5||!Number.isFinite(cost)||cost<=0||c.upgradePoints<cost)return false;c.upgradePoints-=cost;c[kind]=level;return true;}
return {migrate,event,begin,lap,advance,qualify,score,standings,nextSeason,recordLap,simulateQualifying,buyUpgrade,POINTS};
});
