# Engine audio

The Williams cockpit recordings supplied on 12 September 2026 replace the mixed-car MP3 playback. Prepared mono 48 kHz WAV loops live in assets/audio/williams; regions.json records source cuts and relative harmonic anchors. Original user WAVs are untouched. Idle and steady-low contained identical audio.

Steady sections and selected acceleration sections are pitch-stabilized, normalized and crossfaded at their loop seams. They sustain indefinitely rather than repeatedly replaying a rising note. The short acceleration burst supplies the highest register. Lift-off supplies three off-throttle registers.

engine-sound.js uses a cosmetic speed-based gearbox with downshift hysteresis. Adjacent loops are pitch-matched and blended according to revs; throttle blends loaded and unloaded engine tone. Shifts produce a pitch drop and brief load dip. Nine continuous sources start once per session; pedal changes never restart them. Grid lock always selects unpitched idle. Existing home, pause, restart and visibility hooks stop playback.

The harmonic anchors are relative pitch measurements, not actual RPM telemetry. Higher off-throttle pitches are extrapolated because the supplied recording has limited high-rev sustain. This is a loop-based approximation, not a full professionally recorded engine library.

Source: Pole Position Production Williams FW29 2007 cockpit recording included in the Sonniss 2016 GDC bundle, edited by the user. See https://sonniss.com/gameaudiogdc/ and https://sonniss.com/gdc-bundle-license/ . Assets are incorporated for this game; do not redistribute them as a standalone sound library.

Validation: node --test tests/*.test.cjs covers fixed grid idle, lift continuity, shift pitch/hysteresis, sustained revs, source reuse and cleanup. All 47 tests pass. A 30-second browser OfflineAudioContext render using the real WAVs decoded all nine loops, exercised grid/acceleration/lift/braking/coasting, and measured peak 0.321 and RMS 0.071 with no non-finite samples. Subjective listening in-game remains the final judgement of timbre.
