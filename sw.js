/* The game, offline.

   Two policies, because the files fall into two kinds. The page itself is
   network-first: if there is a connection it takes the fresh copy, so an update
   arrives the moment it is deployed, and it falls back to the cached copy when
   there is nothing to ask. Everything else -- the circuit, the car, the
   textures, the engine audio -- is cache-first, because a 21 MB model does not
   change between one lap and the next and asking the network about it every
   time is the whole of what makes this need Wi-Fi.

   Nothing is precached on install beyond the shell. The circuit is cached the
   first time it is actually fetched, which means the first load costs what it
   always did and every load after it costs nothing. */
const CACHE='f1sim-v1';
const SHELL=[
  './','./index.html','./GLTFLoader.js','./meshopt_decoder.js',
  './road.jpg','./rock.jpg','./bark.jpg','./barkn.jpg','./leaf.png',
  './trees.json','./trees.bin',
  './idle.mp3','./accel.mp3','./coast.mp3','./brake.mp3',
  './home-hero.png','./home-race.webp','./home-best-laps.webp',
  './home-controller.webp','./home-customise.webp'
];
self.addEventListener('install', e=>{
  e.waitUntil((async()=>{
    const c=await caches.open(CACHE);
    /* One at a time and forgiving: a shell file that 404s must not take the
       whole install down with it, or the game has no offline mode because of
       one missing image. */
    await Promise.all(SHELL.map(u=>c.add(u).catch(err=>console.warn('sw: skipped',u,err))));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e=>{
  e.waitUntil((async()=>{
    for(const k of await caches.keys()) if(k!==CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e=>{
  const req=e.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==location.origin) return;          // peer signalling and the like
  const isPage = req.mode==='navigate' || url.pathname.endsWith('/') ||
                 url.pathname.endsWith('index.html');
  if(isPage){
    e.respondWith((async()=>{
      try{
        const fresh=await fetch(req);
        const c=await caches.open(CACHE); c.put(req, fresh.clone());
        return fresh;
      }catch(err){
        return (await caches.match(req)) || (await caches.match('./index.html'));
      }
    })());
    return;
  }
  e.respondWith((async()=>{
    const hit=await caches.match(req);
    if(hit) return hit;
    const res=await fetch(req);
    /* Ranged replies are not a whole file and caching one poisons the entry --
       the audio elements ask for ranges. */
    if(res.ok && res.status===200){
      const c=await caches.open(CACHE); c.put(req, res.clone());
    }
    return res;
  })());
});
