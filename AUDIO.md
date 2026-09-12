# Direct recorded engine playback

The player now uses the supplied MP3s directly:

- acceleration.mp3: 33e51ca2-6622-4e01-9a10-7312b6d8527a.mp3
- braking.mp3: 9c8de92e-cc24-4218-a2c0-ec3f89dfc4ce.mp3
- idle.mp3: 090a0cf8-6dd2-46e6-a193-af34f7b4dd32.mp3

They are copied byte-for-byte into assets/audio/direct-recordings. The
short burst and older processed banks are no longer used. There are no
synthetic gear shifts, harmonic reconstruction, or repeating micro-grains.

Holding acceleration plays forward through the actual recording, including
its recorded shifts. Approximate road-speed markers choose the initial
position. During uninterrupted playback, a gentle 0.9–1.1 playback-rate
correction follows the speed mismatch without repeated seeking. This is
an approximate recording-to-speed mapping, not measured car telemetry.

Lifting remembers the acceleration cursor. Reapplying within 1.5 seconds
resumes it if speed changed by at most 35 km/h and the saved position is
within five recording seconds of the current speed marker. Otherwise,
playback starts from the current speed marker. A 35 ms pedal debounce
prevents one-frame chatter. Grid/stationary idle is immediate.

Braking plays the braking recording at normal speed, starting later when
already travelling slowly. Coasting shares that transport at 0.85 speed;
switching between brake and coast never restarts it.

After the full usable acceleration passage, only its 16.2–23.4-second
high-speed tail repeats. Brake sustain repeats 2.8–5.15 seconds. The final
60 ms of each recording crossfades to the tail-loop entry, leaving the
rest of its waveform untouched. Constant per-clip gain balances levels,
and a 55 Hz high-pass reduces rumble. Mode changes use 60 ms crossfades.
Grid/home/restart/visibility hooks retain idle/stop behavior.

Validation: all 49 tests pass. Coverage includes grid lock, one-second lift
resume, speed-loss/long-lift relocation, continuous held playback, long-tail
wrapping, brake/coast continuity, chatter filtering, bounded voice cleanup,
and preserving decoded source audio outside the final wrap crossfade.
A 44-second browser OfflineAudioContext render uses the actual MP3s and
exercises launch, a one-second lift/reapplication, sustained acceleration,
tail wrapping, coasting, braking and idle. Listening approval remains on
the preview deployment; production is not promoted automatically.
