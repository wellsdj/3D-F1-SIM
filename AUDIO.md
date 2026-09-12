# Engine audio

The Williams cockpit recordings supplied on 12 September 2026 replace the mixed-car MP3 playback. Prepared mono 48 kHz WAV loops live in assets/audio/williams; regions.json records source cuts and relative harmonic anchors. Original user WAVs are untouched. Idle and steady-low contained identical audio.

Steady sections and selected acceleration sections are pitch-stabilized, normalized and crossfaded at their loop seams. The short acceleration burst supplies the highest register. Lift-off supplies three off-throttle registers.

The original 0.35–0.85 second upper-register loops repeated their recorded gestures too often. The next approach, tools/prepare-engine-textures.py, produced longer beds but its 65–105 ms fragment joins introduced rapid flutter. That method remains in the off-throttle assets only; texture-preparation.json describes that intermediate bank.

Acceleration now uses tools/prepare-engine-sustain.py: a source-derived harmonic/noise reconstruction with continuous harmonic phases, broad recorded noise texture, and envelope correction for rapid flutter. No fragment joins occur during acceleration sustain. Harmonic amplitudes and noise spectrum come from the supplied recordings; the result is processed/resynthesized audio, not an untouched recording or Forza's proprietary engine. Integer harmonic cycles close each roughly 16-second bed. sustain-preparation.json records the actual tuned frequencies and measurements. Run against the original prepared bank (from commit 5892c0f), not the granular output. Preparation is offline, so runtime still uses nine sources.

engine-sound.js uses a cosmetic speed-based gearbox with downshift hysteresis. Adjacent loops are pitch-matched and blended according to revs; throttle blends loaded and unloaded engine tone. Off-throttle retains a small loaded-register contribution to preserve mechanical presence instead of substituting only the low-rev deceleration take. Throttle never directly lowers pitch. Shifts produce a pitch drop and brief load dip. Nine continuous sources start once per session; pedal changes never restart them. Grid lock always selects unpitched idle. Existing home, pause, restart and visibility hooks stop playback.

All registers, including muted ones, now follow the same pitch automation from their initial start, preserving harmonic phase relationships as adjacent registers fade in. This avoids the previous drift caused by changing playback rate only while a register was audible. Gear thresholds and shift envelopes are unchanged.

The harmonic anchors are relative pitch measurements, not actual RPM telemetry. Higher off-throttle pitches are extrapolated because the supplied recording has limited high-rev sustain. This is a loop-based approximation, not a full professionally recorded engine library.

Source: Pole Position Production Williams FW29 2007 cockpit recording included in the Sonniss 2016 GDC bundle, edited by the user. See https://sonniss.com/gameaudiogdc/ and https://sonniss.com/gdc-bundle-license/ . Assets are incorporated for this game; do not redistribute them as a standalone sound library.

Comparison references: Forza Horizon 5 lead audio designer Fraser Strachan describes granular engine playback and acceleration/deceleration capture at https://www.asoundeffect.com/forza-5-game-audio/ . Turn 10 and Project CARS audio leads describe physics-driven RPM/load blending at https://designingsound.org/2014/08/11/vehicle-engine-design-project-cars-forza-motorsport-5-and-rev/ . This implementation borrows those principles, not their proprietary engine or recordings.

Validation: all 48 tests pass, including automation of muted-register pitch, grid idle, lift continuity, shifts, coasting and cleanup. Identical 36-second browser OfflineAudioContext renders against commit 381d31f decoded all nine assets: before peak 0.314/RMS 0.072; after peak 0.294/RMS 0.079, all samples finite. At sustained 320 km/h, normalized envelope modulation in the 5–20 Hz band fell from 0.0453 to 0.0131 (71%). That is a narrow objective flutter measurement, not a claim of 71% better sound or a subjective listening review.
