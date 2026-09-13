# Celebration driver

`driver.glb` — the model on the celebration screen. It is a **static** model:
`skins: 0`, `animations: 0`, 21 rigid meshes. It has no skeleton and no skin
weights, so the motion on the celebration screen is applied to the whole model
rather than to bones.

`Victory.fbx` — a Mixamo clip: 65 `LimbNode` bones named `mixamorig:*`, one
AnimationStack, and no mesh. It drives a mixamorig skeleton.

**These two cannot be combined as they are.** The clip needs a skeleton to
move, and the driver has none. To use it:

1. Put `driver.glb` through Mixamo's auto-rigger (or rig and skin it in
   Blender) so it comes back with a `mixamorig` skeleton and skin weights.
2. Export it as a `.glb` **with** the Victory animation baked in, or keep the
   clip separate and load it with an FBX loader.
3. In `index.html`, `celebrateScene()` already loads the model and runs a
   render loop. Swap the procedural motion for an `AnimationMixer` playing the
   clip from `gltf.animations`.

`Victory.fbx` is kept here so it is not lost, and is deliberately **not** in
the service-worker shell — nothing loads it yet, so shipping it to every
visitor would be 2.3 MB for nothing.

## Walking.fbx

Different from Victory.fbx: this one contains **its own skinned character** as
well as the clip — 130 `LimbNode` bones, 4 `Skin` deformers, 7 `Geometry`
nodes. So it would animate correctly on its own, but the figure in it is
Mixamo's generic character, not this race driver.

That leaves three honest options, in order of how much work they are:

1. **Rig the driver** (Mixamo auto-rigger or Blender). Both clips then play on
   the driver, which is what was actually wanted. One-off asset job.
2. **Ship Mixamo's character** instead of the driver for the walking shot. It
   would be genuinely animated, but it is a different person to the one on the
   podium, and it needs an FBX loader (~200 KB) plus a 1.7 MB download.
3. **What is in the game now**: the driver model with the motion applied to the
   whole figure. No legs move, because there are none to move.
