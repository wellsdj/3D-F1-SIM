# Handoff — 3D F1 Sim

Single-file app: everything is `index.html`. No build step, no dependencies
beyond three.js r128 (CDN) and the GLB models in the repo root. Open it in a
browser, or push to `main` — the site auto-deploys from there.

Repo: `wellsdj/3D-F1-SIM`. Work on `claude/f1-driving-scene-kaxey5`, then
fast-forward `main` to it and push both (see any recent commit for the exact
sequence — fetch main, checkout, reset --hard to the remote, merge --ff-only
the work branch in, push).

## Where things are

**One circuit is live: Spa 2022** (`spa2022.glb`, ~80 MB, texture-compressed
from a 148 MB source — see commit `30e4c65` / `0913bba` region for why it's
that size and not smaller). It's the only button on the home screen; two other
tracks (`Pinewood`, procedural; `Spa 1998`, `spa.glb`) still work in the code
but are hidden — see `TRACKS` object and the `#pick` buttons in the HTML if
you ever need to bring one back.

**Free-roam driving**, not a lap-based track sim. Physics are in world space
(`carState.wx/wz/hdg`), not Frenet track-space — Spa has no usable centreline
(see "Known dead ends" below), so there's no lap timer, no minimap, no racing
line on this track. All of that code still exists and still runs on Pinewood.

**Everything about the car and the ground is derived from the model at load**,
not hand-tuned per track:
- Road mesh found by shape (long, thin, mostly-empty bounding box) — `findRoadMesh`
- Units detected by whether the road spans a plausible circuit size — same function
- Ground height comes from a spatial index of every "floor-like" triangle in
  the whole model, not just the road — `buildHeightField` / `groundAt`
- Car sits on a plane fit through its own four wheel contact points (measured
  off the loaded car model, not guessed) — search `CARPTS`, `RIDE`
- Gravel and grass are detected by material name and tagged into that same
  height-field index — `LOOSE_RE`, `GRASS_RE`

**Start position is hand-measured, not inferred.** After three failed
attempts to derive it from pit-lane/start-light geometry (all landed the car
in a car park — see git log for `spawnAt`), there's now a `spawnAt:[x,z,heading]`
constant per track, filled in by literally parking the car and reading the
number off. That's the pattern for anything geometry-derivation keeps
getting wrong: stop deriving it, measure it by hand, hardcode it.

## Barriers — where this is genuinely unfinished

This is the part to be careful with.

**What exists:** every barrier mesh (`BARRIER_RE` matches material names like
`barrie`, `jersey`, `wall`, `grail`, `guard`, `armco`, `tyre`) gets flattened
to 2D line segments on the ground and put in a spatial index (`buildBarrierField`
/ `barrierAt`). The car collides with these: velocity is split into the part
driving into the wall (killed) and the part running along it (kept), so a
graze slides you along the barrier and a square hit stops you dead. There's a
hard rule that no barrier line may sit more than 2 m inside the drivable road
surface (`ON_TRACK`), checked against `roadDepth()` — anything that fails this
is dropped rather than kept, because a wrongly-placed barrier that's *missing*
is far less bad than one that's an invisible wall in the middle of the track.

**Why this needs more work:** the automatic extraction from the GLB is
unreliable. The user has driven it and confirms barriers are in wrong places
— sometimes on the track, sometimes not where the visible wall is. The 2m
rule catches the worst case (a wall bisecting the road) but doesn't mean the
surviving lines are actually correct.

**The plan, already built and waiting to be used:** there is a manual
marking tool in the game itself.

- Press `M` to enter mark mode. Click on the ground/barrier in the 3D view —
  each click raycasts into the actual track mesh and drops a point at the
  true elevation there (same height the car itself rides at, so the drawn
  line doesn't disappear into the road).
- Keep clicking to bend the line along a barrier's real shape.
- Double-click to end that line and start fresh on the next click.
- Press `N` to print every line drawn so far to the console **and copy it to
  the clipboard**, as JSON arrays of `[x,z]` pairs in the model's own
  coordinate frame (same frame `spawnAt` uses — stable across reloads,
  independent of wherever the loader happens to re-anchor the world that
  session).

**This is the workflow the user is going to hand you:** they will drive
around, find a barrier that's wrong, trace its real position with this tool,
hit `N`, and paste you the resulting numbers directly in chat. You will not
be able to see the track yourself — you have to take those coordinates on
trust and work out what to do with them. Concretely that probably means:
a way to feed hand-drawn line(s) in as an override that either replaces or
patches the auto-extracted barrier segments for that stretch of track, keyed
however is easiest to match up (e.g. paste them into a constant in the file,
same pattern as `spawnAt`). Don't try to re-derive or "improve" their numbers
— they clicked on the actual wall in the actual running app, which is ground
truth this session has no way to get any other way.

## Known dead ends — don't retry these

- **No centreline could be extracted from either Spa model.** Both rim-pairing
  and ridge-following were tried and failed (fragmented loops, nonsense
  widths — the geometry is a game-rip, not clean CAD). This is why there's no
  lap timer/minimap/racing-line on Spa. Don't spend time re-deriving it unless
  the user specifically asks for lap timing back — and if they do, expect to
  need either a different extraction approach entirely or (more likely) the
  same hand-drawn-line trick as the barriers.
- **Start position from pit-lane/start-light geometry**: tried three ways,
  wrong every time (car park, wrong heading, etc.). Now hand-measured via
  `spawnAt`. Do not try to re-automate this for Spa; it's fine to attempt for
  a *new* track model but expect to fall back to hand-measuring again.
- **Draco compression** on `spa2022.glb`: worked, produced a much smaller
  file, but three.js r128 doesn't dequantize `KHR_mesh_quantization` properly,
  which silently corrupted every position in the file (auto-detection returned
  wildly wrong scale, 32767x too large). Looked fine until measured. If
  re-compressing this or any future GLB, use meshopt or plain texture
  compression, not Draco, unless you also upgrade the three.js version and
  verify positions numerically after.
- **Turning up "grip" (`A_GRIP`) as the fix for "hard to drive"**: raising
  grip *also* raises the steering lock the rack is allowed to reach (they're
  coupled through `lockGrip`), so it makes the car both stickier and twitchier
  at the same time. If handling feels off, check whether the actual complaint
  is about lock/turn-rate vs. grip before changing `A_GRIP` — they're separate
  dials now (`A_GRIP`, `turnBoost()`, `STEER_LOCK`) precisely because
  conflating them caused several rounds of back-and-forth with the user.

## House style, if you're continuing this conversationally

The user gives short, sometimes terse or typo'd instructions and expects the
work verified before being reported as done — they've caught claimed fixes
that weren't tested more than once. Prefer measuring/testing in a headless
browser (playwright) over asserting something works from reading the code.
When something is uncertain or a change is inherently unverifiable without
the user's own eyes (like anything about how a specific barrier looks in
context), say so plainly rather than implying it's confirmed.
