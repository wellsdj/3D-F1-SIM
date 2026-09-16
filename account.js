/* THE WAY IN, AND THE SAVE THAT FOLLOWS YOU.
   ==========================================================================
   The game keeps everything it remembers in localStorage: the career, the
   laps, the car, the settings. That is fast and it is free and it belongs to
   a browser rather than to a person -- clear the site data, or sit at a
   different machine, and the season is gone.

   This puts an account in front of it. Sign in first, and from then on the
   same localStorage the game already reads is mirrored to a row in Postgres:
   pulled down when you sign in, pushed back up a couple of seconds after
   anything changes. Not one line of the game had to learn about accounts --
   it still reads and writes exactly what it always did.

   THREE DELIBERATE CHOICES.

   No email, no reset link, no third-party sign-in. A username, a password,
   and a recovery code shown once when the account is made. Nobody wants to
   give an address to a racing game, and an address is the only thing a reset
   link is actually for.

   The gate is the first thing on screen and there is no way past it, because
   a save that is sometimes local and sometimes not is a save that will
   eventually be lost in the gap.

   And the mirror is a whole document, not a field at a time. The game's own
   shape changes constantly; a blob does not care, and the alternative is a
   schema migration every time a new setting is added.
   ========================================================================== */
(function(){
'use strict';

const API='/api/account';
const TOKEN_KEY='slipstream.session';
const NAME_KEY='slipstream.username';

/* WHAT TRAVELS WITH YOU, AND WHAT DOES NOT.

   Everything the game stores under these prefixes is yours: the career, the
   lap history, the car, the settings. The editors' baked geometry is not --
   walls, painted surface and the hand-adjusted racing line are the circuit
   itself, the same for everybody, and megabytes of it. It stays on the
   machine that drew it. */
const MINE=[/^f1sim\./, /^apex\./, /^careerSlots/, /^gfxScale$/];
const NOT_MINE=[/wall/i, /surf/i, /paint\.bake/i, /^f1sim\.line/i, /tle/i, /\.bake/i];
const isMine=k => MINE.some(re=>re.test(k)) && !NOT_MINE.some(re=>re.test(k));

const PUSH_AFTER=2500;         // ms of quiet before a change is sent up
/* One reload, ever, per visit. Applying somebody's save means the page has to
   read it again from the beginning -- but the game writes a few of its own
   keys as it boots (the detail level it settled on, the track-limits default),
   so "what came down differs from what is here" can be true again immediately
   afterwards. Without this marker that is a reload loop, and a reload loop is
   a site nobody can use. Anything still differing is simply left: it is the
   game's own runtime state, and it goes back up on the next change. */
const RELOADED='slipstream.reloaded';
let token=null, username=null, pushTimer=0, pushing=false, dirty=false;

/* ------------------------------------------------------------- the wire */
async function call(action, body){
  const r=await fetch(API,{method:'POST',headers:{'content-type':'application/json'},
                           body:JSON.stringify({action, token, ...body})});
  let data=null;
  try{ data=await r.json(); }catch(_){ data=null; }
  if(!r.ok) throw new Error((data&&data.error)||'Something went wrong. Try again.');
  return data||{};
}

/* ------------------------------------------------------------- the save */
function snapshot(){
  const out={};
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(isMine(k)) out[k]=localStorage.getItem(k);
  }
  return out;
}
/* Returns true when the incoming save actually differs, because the game has
   already read most of these keys by the time this runs -- so the only
   honest way to apply somebody else's progress is to load the page again,
   and the only time that is worth doing is when there is something new. */
function applySave(save){
  if(!save||typeof save!=='object') return false;
  let changed=false;
  for(const k of Object.keys(save)){
    if(!isMine(k)) continue;
    const v=save[k];
    if(typeof v!=='string') continue;
    if(localStorage.getItem(k)!==v){ localStorage.setItem(k,v); changed=true; }
  }
  return changed;
}
function schedulePush(){
  if(!token) return;
  dirty=true;
  clearTimeout(pushTimer);
  pushTimer=setTimeout(pushNow, PUSH_AFTER);
}
async function pushNow(){
  if(!token || pushing || !dirty) return;
  pushing=true; dirty=false;
  try{ await call('save',{save:snapshot()}); mark('Saved'); }
  catch(e){ dirty=true; mark('Save failed'); }
  finally{ pushing=false; }
}
/* Every write the game makes is a reason to send the save up. Wrapping the
   two methods it uses is exact and costs nothing; polling would be neither. */
function watchStorage(){
  const set=localStorage.setItem.bind(localStorage);
  const del=localStorage.removeItem.bind(localStorage);
  localStorage.setItem=function(k,v){ set(k,v); if(isMine(k)) schedulePush(); };
  localStorage.removeItem=function(k){ del(k); if(isMine(k)) schedulePush(); };
  /* A tab being closed is the one moment a two-second debounce is too slow. */
  addEventListener('pagehide',()=>{
    if(!token||!dirty) return;
    try{
      const blob=new Blob([JSON.stringify({action:'save',token,save:snapshot()})],
                          {type:'application/json'});
      navigator.sendBeacon(API, blob);
    }catch(_){}
  });
}

/* ------------------------------------------------------------ the badge */
let chip=null;
function mark(text){
  if(!chip) return;
  const s=chip.querySelector('.acc-state');
  if(!s) return;
  s.textContent=text;
  s.classList.add('lit');
  clearTimeout(mark._t);
  mark._t=setTimeout(()=>s.classList.remove('lit'), 1600);
}
function showChip(){
  if(!chip){
    chip=document.createElement('div');
    chip.id='accountchip';
    document.body.appendChild(chip);
  }
  chip.innerHTML='<b></b><span class="acc-state">Signed in</span>'
                +'<button type="button" class="acc-code">New code</button>'
                +'<button type="button" class="acc-out">Sign out</button>';
  chip.querySelector('b').textContent=username||'';
  chip.querySelector('.acc-out').onclick=signOut;
  chip.querySelector('.acc-code').onclick=async()=>{
    try{ const r=await call('newcode',{}); codeScreen(r.recovery, 'A new recovery code'); }
    catch(e){ mark(e.message); }
  };
  chip.classList.add('on');
}
async function signOut(){
  await pushNow().catch(()=>{});
  try{ await call('logout',{}); }catch(_){}
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NAME_KEY);
  try{ sessionStorage.removeItem(RELOADED); }catch(_){}
  location.reload();
}

/* ------------------------------------------------------------- the gate */
const gate=document.createElement('div');
gate.id='signin';
gate.setAttribute('role','dialog');
gate.setAttribute('aria-modal','true');

function field(id,label,type,extra){
  return '<label class="sf"><span>'+label+'</span>'
        +'<input id="'+id+'" type="'+type+'" autocomplete="'+(extra||'off')+'" spellcheck="false"></label>';
}
function shell(inner){
  gate.innerHTML='<div class="signin-card">'
    +'<div class="si-helm" aria-hidden="true"></div>'
    +'<div class="si-body">'+inner+'</div></div>';
  document.body.appendChild(gate);
  gate.classList.add('on');
}
function say(msg, good){
  const el=gate.querySelector('.si-msg');
  if(el){ el.textContent=msg||''; el.classList.toggle('good',!!good); }
}
function busy(on){
  const b=gate.querySelector('.si-go');
  if(b){ b.disabled=!!on; b.dataset.busy=on?'1':''; }
}

function signInScreen(prefill){
  shell(
     '<div class="si-kick">Slipstream</div>'
    +'<h2 class="si-word">Welcome <em>back.</em></h2>'
    +'<p class="si-note">Your career, your laps and your car live with your account, not with this browser.</p>'
    +field('si-user','Username','text','username')
    +field('si-pass','Password','password','current-password')
    +'<p class="si-msg" role="alert"></p>'
    +'<button type="button" class="si-go">Sign in</button>'
    +'<div class="si-alt"><button type="button" class="si-link" data-go="create">Create an account</button>'
    +'<button type="button" class="si-link quiet" data-go="recover">Forgotten your password?</button></div>');
  const user=gate.querySelector('#si-user');
  if(prefill) user.value=prefill;
  const go=async()=>{
    const u=user.value.trim(), p=gate.querySelector('#si-pass').value;
    if(!u||!p) return say('Enter your username and password');
    busy(true); say('');
    try{
      const r=await call('login',{username:u,password:p});
      await accept(r);
    }catch(e){ busy(false); say(e.message); }
  };
  gate.querySelector('.si-go').onclick=go;
  wireEnter(go);
  wireLinks();
  user.focus();
}

function createScreen(){
  shell(
     '<div class="si-kick">Slipstream</div>'
    +'<h2 class="si-word">New <em>driver.</em></h2>'
    +'<p class="si-note">Pick a name and a password. There is no email and no reset link &mdash; you get a recovery code instead, and it is the only way back in.</p>'
    +field('si-user','Username','text','username')
    +field('si-pass','Password','password','new-password')
    +field('si-pass2','Password again','password','new-password')
    +'<p class="si-msg" role="alert"></p>'
    +'<button type="button" class="si-go">Create account</button>'
    +'<div class="si-alt"><button type="button" class="si-link" data-go="signin">I already have an account</button></div>');
  const go=async()=>{
    const u=gate.querySelector('#si-user').value.trim();
    const p=gate.querySelector('#si-pass').value;
    const p2=gate.querySelector('#si-pass2').value;
    if(p!==p2) return say('Those two passwords are not the same');
    busy(true); say('');
    try{
      /* Whatever is already in this browser comes with you: the first account
         made on a machine adopts the career that is sitting there. */
      const r=await call('create',{username:u,password:p,save:snapshot()});
      pending=r;
      codeScreen(r.recovery,'Save your recovery code');
    }catch(e){ busy(false); say(e.message); }
  };
  gate.querySelector('.si-go').onclick=go;
  wireEnter(go);
  wireLinks();
  gate.querySelector('#si-user').focus();
}

function recoverScreen(){
  shell(
     '<div class="si-kick">Slipstream</div>'
    +'<h2 class="si-word">Lost <em>password.</em></h2>'
    +'<p class="si-note">Enter the recovery code you were given when the account was made, and pick a new password. The old code stops working and you will be given a fresh one.</p>'
    +field('si-user','Username','text','username')
    +field('si-code','Recovery code','text')
    +field('si-pass','New password','password','new-password')
    +'<p class="si-msg" role="alert"></p>'
    +'<button type="button" class="si-go">Set a new password</button>'
    +'<div class="si-alt"><button type="button" class="si-link" data-go="signin">Back to signing in</button></div>');
  const go=async()=>{
    busy(true); say('');
    try{
      const r=await call('recover',{username:gate.querySelector('#si-user').value.trim(),
                                    code:gate.querySelector('#si-code').value,
                                    password:gate.querySelector('#si-pass').value});
      pending=r;
      codeScreen(r.recovery,'Your new recovery code');
    }catch(e){ busy(false); say(e.message); }
  };
  gate.querySelector('.si-go').onclick=go;
  wireEnter(go);
  wireLinks();
  gate.querySelector('#si-user').focus();
}

/* The one screen the code is ever readable on. It is not shown again and it
   cannot be looked up: what the database holds is a hash of it. */
let pending=null;
function codeScreen(code, title){
  shell(
     '<div class="si-kick">Write this down</div>'
    +'<h2 class="si-word">'+title.replace(/</g,'')+'</h2>'
    +'<div class="si-code">'+String(code).replace(/[<>]/g,'')+'</div>'
    +'<p class="si-note">This is the only way back into your account if you forget your password. There is no email and no reset link. Keep it somewhere you will still have it in a year.</p>'
    +'<p class="si-msg" role="alert"></p>'
    +'<div class="si-alt two"><button type="button" class="si-go">I have saved it</button>'
    +'<button type="button" class="si-link" data-copy="1">Copy</button></div>');
  gate.querySelector('[data-copy]').onclick=async()=>{
    try{ await navigator.clipboard.writeText(code); say('Copied to the clipboard', true); }
    catch(_){ say('Select it and copy it by hand'); }
  };
  gate.querySelector('.si-go').onclick=()=>{
    if(pending){ const p=pending; pending=null; accept(p); }
    else { gate.classList.remove('on'); }
  };
  gate.querySelector('.si-go').focus();
}

function wireEnter(go){
  gate.querySelectorAll('input').forEach(i=>{
    i.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); go(); } });
  });
}
function wireLinks(){
  gate.querySelectorAll('[data-go]').forEach(b=>{
    b.onclick=()=>({signin:signInScreen, create:createScreen, recover:recoverScreen})[b.dataset.go]();
  });
}

/* Signed in: keep the token, put their save in place, and get out of the way. */
async function accept(r){
  token=r.token; username=r.username;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(NAME_KEY, username);
  const changed=applySave(r.save);
  gate.classList.remove('on');
  showChip();
  watchStorage();
  /* Their progress was not what this browser had, so the game has to read it
     again from the beginning. Once, and only when it really differs. */
  let already=false;
  try{ already=!!sessionStorage.getItem(RELOADED); }catch(_){}
  if(changed && !already){
    try{ sessionStorage.setItem(RELOADED,'1'); }catch(_){}
    setTimeout(()=>location.reload(), 220);
    return;
  }
  /* Nothing came down -- a new account, or a machine that was already up to
     date -- so what is here is what belongs up there. */
  schedulePush();
}

/* ------------------------------------------------------------------ boot */
async function start(){
  const saved=localStorage.getItem(TOKEN_KEY);
  if(saved){
    token=saved;
    try{
      const r=await call('me',{});
      await accept({...r, token:saved});
      return;
    }catch(e){
      token=null;
      localStorage.removeItem(TOKEN_KEY);
    }
  }
  signInScreen(localStorage.getItem(NAME_KEY)||'');
}

if(document.readyState==='loading') addEventListener('DOMContentLoaded',start,{once:true});
else start();

/* A small surface for the tests and for the game, which mostly does not need
   to know any of this exists. */
window.ACCOUNT={
  get user(){ return username; },
  get signedIn(){ return !!token; },
  save:()=>pushNow(),
  snapshot, isMine, signOut
};
})();
