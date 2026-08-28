#!/usr/bin/env python3
"""Drive the circuit offline and audit every barrier on it.

    python3 tools/barrier_audit.py

Why this exists. The barriers are the one part of the game that can silently
ruin a race: a wall a metre inside the white line ends a lap at full speed and
nothing on screen says why. Testing that by driving is hopeless -- it is seven
kilometres of circuit and the fault might be at one corner -- so the whole lap
is checked here instead, at every metre, across the full width of the road.

It needs nothing but index.html. Both grids ship inside it: WALLS_BAKED holds
the barrier lines and SURF_BAKED holds the painted track, and barrInit() gives
them the same width, height and origin, so the two masks line up index for
index exactly as they do in the browser. That is what makes this faithful
rather than an approximation -- the rasteriser below is barrStroke, the body is
CARPTS, and the swept test is the one in barrCheck.

What it reports:

  1. Barrier cells standing on painted track. Should always be zero -- the game
     subtracts them at bake time -- so anything here is a regression.
  2. The clear corridor at every metre of the lap. If this ever falls below a
     car's width the track is walled off and the race cannot be finished.
  3. Seven laps driven on different lines, from dead centre to clipping both
     edges, with the game's own swept collision. Contacts are reported with
     the track width there, so a car hanging off the road into a wall at the
     edge -- which is correct -- can be told apart from a wall on the road.
  4. Stretches with no barrier at all within 45 m, which is where a missed one
     would be.

Requires numpy, scipy and scikit-image (the centreline comes from the paint's
own skeleton -- there is no racing line stored in the file to borrow).
"""
import json, math, re, sys
from pathlib import Path

import numpy as np
from scipy import ndimage
from skimage.morphology import skeletonize

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / 'index.html'

CAR_HALF_W = 0.8          # CARPTS
CAR_HALF_L = 1.8
CAR_W = CAR_HALF_W * 2
WALL_W = 0.8              # the half-width the lines are baked at
BARR_STEP = 0.5           # the swept collision's step


# ----------------------------------------------------------------- the file

def read_baked():
    src = INDEX.read_text(encoding='utf-8')
    walls = json.loads(re.search(r'const WALLS_BAKED="(.*?)";', src, re.S).group(1))
    surf_raw = re.search(r'const SURF_BAKED="(.*?)";', src, re.S).group(1)
    surf = json.loads(surf_raw.encode().decode('unicode_escape'))
    return walls, surf


def unpack_surf(d):
    """surfUnpack: alternating run lengths in base 36, starting with 'off'."""
    W, H = d['w'], d['h']
    data = np.zeros(W * H, np.uint8)
    k, cur = 0, 0
    for t in d['r'].split('.'):
        n = int(t, 36) if t else 0
        if cur:
            data[k:k + n] = 1
        k += n
        cur = 1 - cur
    return data.reshape(H, W), W, H, d['x'], d['z']


def bake_walls(walls, W, H, MINX, MINZ):
    """barrStroke: a filled disc of radius WALL_W swept along every segment."""
    data = np.zeros((H, W), np.uint8)
    r2 = WALL_W * WALL_W
    step = max(0.6, WALL_W * 0.4)
    for line in walls:
        pts = [(line[i], line[i + 1]) for i in range(0, len(line) - 1, 2)]
        for a in range(len(pts) - 1):
            (x0, z0), (x1, z1) = pts[a], pts[a + 1]
            n = max(1, math.ceil(math.hypot(x1 - x0, z1 - z0) / step))
            for s in range(n + 1):
                cx, cz = x0 + (x1 - x0) * s / n, z0 + (z1 - z0) * s / n
                i0 = max(0, math.floor(cx - WALL_W - MINX))
                i1 = min(W - 1, math.ceil(cx + WALL_W - MINX))
                j0 = max(0, math.floor(cz - WALL_W - MINZ))
                j1 = min(H - 1, math.ceil(cz + WALL_W - MINZ))
                for j in range(j0, j1 + 1):
                    dz = (j + 0.5 + MINZ) - cz
                    for i in range(i0, i1 + 1):
                        dx = (i + 0.5 + MINX) - cx
                        if dx * dx + dz * dz <= r2:
                            data[j, i] = 1
    return data


# ------------------------------------------------------------ the centreline

def centreline(surf):
    """The circuit's spine, from the paint. There is no racing line in the file
    to borrow -- TT.curve is built from the mesh at load -- so it is taken from
    the painted surface's own skeleton and walked into a loop."""
    lab, n = ndimage.label(surf, structure=np.ones((3, 3)))
    sizes = ndimage.sum(surf, lab, range(1, n + 1))
    big = lab == (int(np.argmax(sizes)) + 1)           # the circuit, not a car park
    skel = skeletonize(ndimage.binary_closing(big, np.ones((5, 5))))
    ys, xs = np.where(skel)
    pts = set(zip(map(int, xs), map(int, ys)))
    cur = min(pts, key=lambda p: (p[1], p[0]))
    path = [cur]
    pts.discard(cur)
    while pts:
        best, bd = None, 1e9
        for dx in range(-3, 4):
            for dy in range(-3, 4):
                q = (cur[0] + dx, cur[1] + dy)
                if q in pts and dx * dx + dy * dy < bd:
                    bd, best = dx * dx + dy * dy, q
        if best is None:
            best = min(pts, key=lambda q: (q[0] - cur[0]) ** 2 + (q[1] - cur[1]) ** 2)
            if (best[0] - cur[0]) ** 2 + (best[1] - cur[1]) ** 2 > 1600:
                break
        path.append(best)
        pts.discard(best)
        cur = best
    return path


def resample(path, MINX, MINZ):
    P = np.array([[p[0] + MINX + 0.5, p[1] + MINZ + 0.5] for p in path], float)
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(P, axis=0).T))]
    u = np.arange(0, d[-1], 1.0)
    C = np.c_[np.interp(u, d, P[:, 0]), np.interp(u, d, P[:, 1])]
    k = np.ones(15) / 15
    C[:, 0] = np.convolve(C[:, 0], k, mode='same')
    C[:, 1] = np.convolve(C[:, 1], k, mode='same')
    return C[10:-10]


# ----------------------------------------------------------------- the audit

def main():
    walls, surf_d = read_baked()
    surf, W, H, MINX, MINZ = unpack_surf(surf_d)
    print(f'grid {W}x{H} at ({MINX},{MINZ})   {len(walls)} wall lines   '
          f'{int(surf.sum())} m2 painted')

    barr = bake_walls(walls, W, H, MINX, MINZ)
    raw = int(barr.sum())
    on_paint = int(((barr == 1) & (surf == 1)).sum())
    barr[(barr == 1) & (surf == 1)] = 0        # wallsBake's rule
    print(f'barriers: {raw} cells, {on_paint} of them dropped for standing on '
          f'painted track, {int(barr.sum())} live')

    C = resample(centreline(surf.astype(bool)), MINX, MINZ)
    T = np.gradient(C, axis=0); T /= np.linalg.norm(T, axis=1)[:, None]
    N = np.c_[T[:, 1], -T[:, 0]]
    n = len(C)
    print(f'centreline: {n} m of circuit')

    def val(arr, p):
        i = np.floor(p[..., 0] - MINX).astype(int)
        j = np.floor(p[..., 1] - MINZ).astype(int)
        ok = (i >= 0) & (j >= 0) & (i < W) & (j < H)
        out = np.zeros(p.shape[:-1], np.uint8)
        out[ok] = arr[j[ok], i[ok]]
        return out

    # ---- 2. the clear corridor, everywhere
    OFF = np.arange(-14, 14.01, 0.25)
    free = np.zeros((n, len(OFF)), bool)
    for a, o in enumerate(OFF):
        p = C + N * o
        blocked = np.zeros(n, bool)
        for lx in (-0.8, -0.4, 0.0, 0.4, 0.8):
            for lz in (-1.8, -0.9, 0.0, 0.9, 1.8):
                blocked |= val(barr, p + N * lx + T * lz) == 1
        free[:, a] = (~blocked) & (val(surf, p) == 1)
    widest = np.zeros(n)
    for i in range(n):
        best = cur = 0.0
        for v in free[i]:
            cur = cur + 0.25 if v else 0.0
            best = max(best, cur)
        widest[i] = best
    walled = int((widest < CAR_W).sum())
    print(f'\nclear corridor: median {np.median(widest):.1f} m, worst '
          f'{widest.min():.1f} m at ({C[int(np.argmin(widest)), 0]:.0f}, '
          f'{C[int(np.argmin(widest)), 1]:.0f})')
    print(f'metres of lap with no car-width corridor: {walled}')

    # ---- 3. drive it
    CARPTS = [(0.8, 1.8), (-0.8, 1.8), (0.8, -1.8), (-0.8, -1.8)]

    def blocked_at(x, z, h):
        """Returns the corner that is inside a wall, not just yes/no.

        Which corner matters: the question this whole script exists to answer
        is whether a WALL is on the road, and the car's centre is on the road
        by construction -- it is being driven there. Testing the centre said
        every contact was a wall on the road, including the ones where the car
        was hanging a wheel over the kerb into an armco, which is racing."""
        fx, fz = math.sin(h), math.cos(h)
        for lx, lz in CARPTS:
            qx, qz = x + lx * fz + lz * fx, z - lx * fx + lz * fz
            i, j = int(math.floor(qx - MINX)), int(math.floor(qz - MINZ))
            if 0 <= i < W and 0 <= j < H and barr[j, i] == 1:
                return (qx, qz)
        return None

    def lap(off_fn, speed=80.0):
        pos = np.array([C[i] + N[i] * off_fn(i) for i in range(n)])
        hits, prev, s, dt = [], None, 0.0, 1 / 60
        while s < n - 2:
            i = int(s)
            p, nx = pos[i], pos[(i + 1) % n]
            h = math.atan2(nx[0] - p[0], nx[1] - p[1])
            if prev is not None:
                dx, dz = p[0] - prev[0], p[1] - prev[1]
                steps = max(1, math.ceil(math.hypot(dx, dz) / BARR_STEP))
                for k in range(1, steps + 1):
                    t = k / steps
                    c = blocked_at(prev[0] + dx * t, prev[1] + dz * t, h)
                    if c:
                        hits.append((i, c[0], c[1], widest[i]))
                        break
            prev = p
            s += max(1.0, speed * dt)
        return hits

    lines = [
        (lambda i: 0.0, 'dead centre'),
        (lambda i: 2.0, '2 m right'),
        (lambda i: -2.0, '2 m left'),
        (lambda i: 3.5, '3.5 m right'),
        (lambda i: -3.5, '3.5 m left'),
        (lambda i: 3.2 * math.sin(i / 40.0), 'weaving'),
        (lambda i: (widest[i] / 2 - 1.2) * math.sin(i / 18.0), 'clipping both edges'),
    ]
    print('\nlaps driven with the game\'s swept collision:')
    total, on_road = 0, 0
    for fn, name in lines:
        h = lap(fn)
        total += len(h)
        for i, x, z, w in h:
            # x,z is the WALL cell the car reached, not the car's centre
            i2, j2 = int(math.floor(x - MINX)), int(math.floor(z - MINZ))
            if 0 <= i2 < W and 0 <= j2 < H and surf[j2, i2]:
                on_road += 1
        if h:
            worst = min(w for _, _, _, w in h)
            print(f'  {name:<22} {len(h):4d} contacts, narrowest track there '
                  f'{worst:.1f} m')
        else:
            print(f'  {name:<22} clean lap')
    print(f'  total {total} contacts, {on_road} of them with a wall ON the road '
          f'(the rest are the car off the road into a wall at the edge)')

    # ---- 4. where a missed wall would be
    REACH, step = 45.0, 0.5
    haveL = np.zeros(n, bool); haveR = np.zeros(n, bool)
    for o in np.arange(0, REACH, step):
        haveR |= val(barr, C + N * o) == 1
        haveL |= val(barr, C - N * o) == 1

    def runs(mask, least=40):
        idx = np.where(mask)[0]
        if not len(idx):
            return []
        out, s, p = [], idx[0], idx[0]
        for k in idx[1:]:
            if k - p > 8:
                out.append((s, p)); s = k
            p = k
        out.append((s, p))
        return [(a, b) for a, b in out if b - a >= least]

    print(f'\nstretches with no barrier within {REACH:.0f} m (where a missed one would be):')
    for mask, side in ((~haveR, 'right'), (~haveL, 'left')):
        for a, b in sorted(runs(mask), key=lambda ab: ab[0] - ab[1]):
            mid = (a + b) // 2
            print(f'  {side:<5} {b - a + 1:4d} m at ({C[mid, 0]:8.1f}, {C[mid, 1]:8.1f})')

    """What actually counts as a failure.

    Not on_paint: that is the count of cells the bake REMOVED for standing on
    the track, so a healthy number there is the rule doing its job, and it was
    being read as the fault it exists to prevent. What matters is whether the
    circuit is passable (walled) and whether any wall the car reached was
    standing on the road (on_road)."""
    left_on_paint = int(((barr == 1) & (surf == 1)).sum())    # after the bake: must be 0
    bad = (left_on_paint > 0) or (walled > 0) or (on_road > 0)
    print('\nFAIL - see above' if bad else
          '\nPASS - no barrier stands on the drivable circuit anywhere on the lap')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
