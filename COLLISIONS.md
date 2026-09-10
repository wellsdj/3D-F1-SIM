# Collisions and cosmetic wing damage

Car contacts use oriented rectangles, contact-point impulses, low restitution, friction and yaw response. Both cars exchange momentum; cars travelling side by side at the same speed do not receive an artificial braking penalty. Swept checks catch contacts between frame positions. Player and AI barrier contacts share the same response, using the existing authored barrier map and nearby wall normals.

Damage is cosmetic. Impact severity is relative closing speed at the contact point, rather than road speed alone. Only front/rear wing regions beyond the axles are eligible. The model's existing indexed triangles, materials and texture coordinates form detachable sections; there are no replacement box fragments and no chassis or wheel deformation. Sections near the impact separate, retain their shape and tumble around their own centres. Detached parts stop rendering after 20 simulation seconds and are removed on reset. Session/reset actions restore the original geometry. Shared model geometry is never edited in place.

The solver is a planar approximation with a height filter for car pairs, not a full suspension, rollover or deformable-body simulation. Detached pieces are visual and do not become obstacles. Wing eligibility uses this car model's wheel positions and geometry, so a replacement car model needs its wing regions checked.

Validation: `node --test tests/*.test.cjs`. Tests cover momentum/energy, off-centre yaw, separating contacts, side contact, high-speed crossings and swept wall detection. Browser checks use the actual model to confirm visible missing wing sections, unchanged speed and AI geometry, and complete repair/reset.
