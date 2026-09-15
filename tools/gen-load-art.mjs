/* The loading screen's backdrop, drawn rather than photographed.
   One scene -- the climb out of Eau Rouge into Raidillon -- rendered three
   times, once per lighting preset, so the loading screen matches the session
   you are about to drive instead of showing the same washed-out still every
   time. Run: node tools/gen-load-art.mjs   (writes assets/load/*.svg) */
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'load');

const W = 1600, H = 900;

/* Each preset carries the same roles so the composition never changes, only
   its colour language. Same families as the in-game TIME_OF_DAY presets,
   pulled a little darker: this sits behind text. */
const PALETTES = {
  midday: {
    skyTop:'#3a83bd', skyMid:'#9cc4dd', skyLow:'#e4eff5',
    sun:'#fffbe8', sunGlow:'#ffeebb', sunX:0.68, sunY:0.24, sunR:64,
    hillFar:'#a2c0d2', hillMid:'#6b8a96', pines:'#27403a', hillNear:'#34533a',
    grass:'#4a7340', grassLo:'#2b4526', tarmac:'#3a4046', tarmacLit:'#59626b',
    rail:'#b3c2cd', stand:'#242d36', standLit:'#3b4753',
    mist:'#cfe1ee', mistOp:0.22, lights:false,
  },
  sunset: {
    skyTop:'#2b1236', skyMid:'#8e3c4f', skyLow:'#e58d54',
    sun:'#ffe6b8', sunGlow:'#ff9a4c', sunX:0.76, sunY:0.40, sunR:78,
    hillFar:'#6d4353', hillMid:'#452a39', pines:'#1d121a', hillNear:'#2e2222',
    grass:'#463a26', grassLo:'#241d15', tarmac:'#383034', tarmacLit:'#5b484c',
    rail:'#c1a69c', stand:'#261c23', standLit:'#472f34',
    mist:'#f2b48b', mistOp:0.26, lights:false,
  },
  night: {
    skyTop:'#02060f', skyMid:'#08142a', skyLow:'#172c50',
    sun:'#dbe8ff', sunGlow:'#4f6ea6', sunX:0.22, sunY:0.18, sunR:40,
    hillFar:'#12203a', hillMid:'#0b1626', pines:'#040810', hillNear:'#0a1512',
    grass:'#14231a', grassLo:'#080f0c', tarmac:'#171c24', tarmacLit:'#2b3442',
    rail:'#7d8ea1', stand:'#0a0f18', standLit:'#1c2737',
    mist:'#26395a', mistOp:0.28, lights:true,
  },
};

/* ------------------------------------------------------------------ curves */
/* The two track edges, as cubic control points. Sampling them -- rather than
   eyeballing a second set of coordinates -- is what keeps the kerbs on the
   kerb and the posts on the rail. */
const EDGE_L = [[-80,905],[240,832],[470,742],[640,690],[820,634],[1010,556],[1160,486],[1400,392],[1500,352],[1680,300]];
const EDGE_R = [[-80,742],[220,678],[440,600],[600,552],[790,500],[980,438],[1140,374],[1380,292],[1490,256],[1680,208]];

function catmull(pts, t){                       // position + tangent on a Catmull-Rom through pts
  const n = pts.length - 1, f = Math.min(0.999999, Math.max(0, t)) * n, i = Math.floor(f), u = f - i;
  const p = k => pts[Math.min(n, Math.max(0, k))];
  const p0 = p(i - 1), p1 = p(i), p2 = p(i + 1), p3 = p(i + 2);
  const h = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  const g = (a, b, c, d) => 0.5 * ((-a + c) + 2 * (2 * a - 5 * b + 4 * c - d) * u + 3 * (-a + 3 * b - 3 * c + d) * u * u);
  return {x:h(p0[0], p1[0], p2[0], p3[0]), y:h(p0[1], p1[1], p2[1], p3[1]),
          dx:g(p0[0], p1[0], p2[0], p3[0]), dy:g(p0[1], p1[1], p2[1], p3[1])};
}
function sample(pts, steps = 160){
  const out = [];
  for(let i = 0; i <= steps; i++){ const s = catmull(pts, i / steps); out.push([s.x, s.y]); }
  return out;
}
const line = a => 'M' + a.map(q => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' L');
const polyline = pts => line(sample(pts));
/* The road surface is the strip between the two edges: down one, back up the
   other. Sampled, not re-typed, so the fill can never drift off its edges. */
const ribbon = (a, b) => line(sample(a)) + ' L' + sample(b).reverse().map(q => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' L') + ' Z';

/* ------------------------------------------------------------------- hills */
/* A ridge that falls away to the left, so the horizon clears the top of the
   climb on the right instead of being buried by it. Deterministic. */
function ridgePts(seed, y0, y1, amp, step){
  let s = seed, pts = [];
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for(let x = -60; x <= W + 60; x += step){
    const t = (x + 60) / (W + 120);
    const base = y0 + (y1 - y0) * t;
    pts.push([x, base - Math.sin(t * 3.4 + seed) * amp - rnd() * amp * 0.5 + Math.cos(t * 8.1 + seed * 2) * amp * 0.26]);
  }
  return pts;
}
const fillDown = pts => `M${pts[0][0]},${H} L` + pts.map(p => `${p[0].toFixed(0)},${p[1].toFixed(0)}`).join(' L') + ` L${pts[pts.length - 1][0]},${H} Z`;

function pines(pts, colour, every = 2){
  let s = 991, out = '';
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for(let i = 0; i < pts.length; i += every){
    const [x, y] = pts[i], h = 16 + rnd() * 26, w = h * 0.36;
    out += `<path d="M${x.toFixed(0)},${(y + 5).toFixed(0)} l${(-w).toFixed(1)},0 l${w.toFixed(1)},${(-h).toFixed(0)} l${w.toFixed(1)},${h.toFixed(0)} Z" fill="${colour}"/>`;
  }
  return out;
}

/* ------------------------------------------------------------------- track */
function kerbs(){                                 // teeth laid along the inside edge
  let out = '';
  for(let i = 0; i < 44; i++){
    const t = 0.02 + (i / 44) * 0.86, s = catmull(EDGE_L, t);
    const len = Math.hypot(s.dx, s.dy) || 1, ux = s.dx / len, uy = s.dy / len;
    const depth = 20 - t * 12, run = (26 - t * 15);
    const x0 = s.x, y0 = s.y;
    out += `<path d="M${x0.toFixed(1)},${y0.toFixed(1)} l${(ux * run).toFixed(1)},${(uy * run).toFixed(1)} l${(uy * depth).toFixed(1)},${(-ux * depth).toFixed(1)} l${(-ux * run).toFixed(1)},${(-uy * run).toFixed(1)} Z" fill="${i % 2 ? '#ece8e0' : '#c31f2d'}" opacity="0.9"/>`;
  }
  return out;
}
function guardrail(p){
  let out = '';
  const rail = [], top = [];
  for(let i = 0; i <= 80; i++){
    const t = i / 80, s = catmull(EDGE_R, t);
    const len = Math.hypot(s.dx, s.dy) || 1, nx = s.dy / len, ny = -s.dx / len;   // toward the sky side
    const lift = 16 + t * 8;
    rail.push([s.x + nx * lift, s.y + ny * lift]);
    top.push([s.x + nx * (lift + 12), s.y + ny * (lift + 12)]);
    if(i % 4 === 0) out += `<rect x="${(s.x + nx * 4).toFixed(1)}" y="${(s.y + ny * (lift + 10)).toFixed(1)}" width="3.4" height="${(lift + 10).toFixed(0)}" fill="${p.rail}" opacity="0.4"/>`;
  }
  out += `<path d="${line(top)} L${rail.slice().reverse().map(q => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' L')} Z" fill="${p.rail}" opacity="0.72"/>`;
  out += `<path d="${line(rail)}" fill="none" stroke="#000" stroke-width="2" opacity="0.28"/>`;
  return out;
}

/* Grandstand over the top of the climb, and -- at night -- the pylons. */
function stands(p){
  let out = `<g>
      <path d="M1214,246 L1620,166 L1620,286 L1214,366 Z" fill="${p.stand}"/>
      <path d="M1214,246 L1620,166 L1620,192 L1214,272 Z" fill="${p.standLit}" opacity="0.75"/>
      <path d="M1196,268 L1620,184 L1620,200 L1196,284 Z" fill="${p.standLit}" opacity="0.45"/>`;
  for(let i = 0; i < 16; i++){
    const t = i / 16, x = 1238 + t * 356, y = 276 - t * 70;
    out += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="22" height="7" fill="#000" opacity="0.26" transform="rotate(-11 ${x.toFixed(0)} ${y.toFixed(0)})"/>`;
  }
  out += '</g>';
  if(p.lights){
    for(const [x, y, h] of [[1090, 150, 140], [1330, 104, 150], [842, 236, 118]]){
      out += `<g>
          <rect x="${x - 3}" y="${y}" width="6" height="${h}" fill="#0b111c"/>
          <rect x="${x - 24}" y="${y - 18}" width="48" height="18" rx="3" fill="#121b2a"/>
          <rect x="${x - 20}" y="${y - 15}" width="40" height="12" rx="2" fill="#ffe9b0" opacity="0.94"/>
          <path d="M${x - 20},${y - 4} L${x - 150},${H} L${x + 150},${H} L${x + 20},${y - 4} Z" fill="url(#beam)" opacity="0.07"/>
        </g>`;
    }
  }
  return out;
}

function scene(name, p){
  const far  = ridgePts(3, 560, 176, 54, 34);
  const mid  = ridgePts(9, 640, 228, 42, 30);
  const near = ridgePts(17, 742, 286, 30, 26);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.skyTop}"/><stop offset="0.55" stop-color="${p.skyMid}"/><stop offset="1" stop-color="${p.skyLow}"/>
    </linearGradient>
    <radialGradient id="glow" cx="${p.sunX}" cy="${p.sunY}" r="0.46">
      <stop offset="0" stop-color="${p.sunGlow}" stop-opacity="0.8"/><stop offset="1" stop-color="${p.sunGlow}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.grass}"/><stop offset="1" stop-color="${p.grassLo}"/>
    </linearGradient>
    <linearGradient id="tar" x1="0.1" y1="1" x2="0.9" y2="0">
      <stop offset="0" stop-color="${p.tarmac}"/><stop offset="1" stop-color="${p.tarmacLit}"/>
    </linearGradient>
    <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.mist}" stop-opacity="0"/><stop offset="1" stop-color="${p.mist}" stop-opacity="${p.mistOp}"/>
    </linearGradient>
    <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe9b0" stop-opacity="0.9"/><stop offset="1" stop-color="#ffe9b0" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="vig" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0.2"/><stop offset="0.46" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.5"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <circle cx="${(p.sunX * W).toFixed(0)}" cy="${(p.sunY * H).toFixed(0)}" r="${(p.sunR * 1.6).toFixed(0)}" fill="${p.sun}" opacity="0.14"/>
  <circle cx="${(p.sunX * W).toFixed(0)}" cy="${(p.sunY * H).toFixed(0)}" r="${(p.sunR * 1.18).toFixed(0)}" fill="${p.sun}" opacity="0.22"/>
  <circle cx="${(p.sunX * W).toFixed(0)}" cy="${(p.sunY * H).toFixed(0)}" r="${p.sunR}" fill="${p.sun}" opacity="${p.lights ? 0.86 : 0.92}"/>

  <path d="${fillDown(far)}" fill="${p.hillFar}" opacity="0.92"/>
  <rect y="120" width="${W}" height="520" fill="url(#mist)"/>
  <path d="${fillDown(mid)}" fill="${p.hillMid}"/>
  ${pines(mid, p.pines)}
  ${stands(p)}
  <path d="${fillDown(near)}" fill="url(#grass)"/>
  ${pines(near, p.pines, 5)}

  <path d="${ribbon(EDGE_L, EDGE_R)}" fill="url(#tar)"/>
  <path d="${polyline(EDGE_L)}" fill="none" stroke="#ece8e0" stroke-width="5" opacity="0.6"/>
  <path d="${polyline(EDGE_R)}" fill="none" stroke="#ece8e0" stroke-width="4" opacity="0.5"/>
  ${kerbs()}
  ${guardrail(p)}

  <rect width="${W}" height="${H}" fill="url(#vig)"/>
</svg>
`;
  mkdirSync(OUT, {recursive:true});
  writeFileSync(join(OUT, `spa-${name}.svg`), svg);
  return svg.length;
}

for(const [name, p] of Object.entries(PALETTES)) console.log(`spa-${name}.svg  ${scene(name, p)} bytes`);
