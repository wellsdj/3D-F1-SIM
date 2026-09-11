# Engine audio

`engine-sound.js` owns sample preparation, cosmetic gear state, and Web Audio playback. It does not change vehicle physics or AI.

Acceleration uses eight speed-selected regions of `accel.mp3`. The early regions follow recorded rev drops; the upper regions divide the longer sustained portion into virtual gears. They are not a claim that the recording contains eight individually recorded gear changes. Speed thresholds and source positions are in `GEARS`. Each region plays into a crossfaded sustain loop, excluding the recording's final slowdown.

A brief lift preserves the current gear's playback cursor (up to 0.8 seconds). Speed-based downshift hysteresis prevents gear chatter; significant speed loss selects a lower region. Longer interruptions resume at a position appropriate to speed. Braking takes priority over throttle, and stationary throttle uses a short rev region.

`coast-lift.mp3` is the supplied c484594d-5db9-4f30-9ed9-16a9b6a32851.mp3, copied without re-encoding. It plays once, then the braking recording plays at 0.5 speed. Subsequent repeats use only the latter half of the braking recording, with a 65 ms source overlap to smooth the seam. Pedal changes cancel both playing and future-scheduled voices. Stopping the car selects idle; home, results, restart and hidden-page handling stop/reset the player.

Silence trimming is capped at 0.4 seconds at either end. Per-region RMS normalization balances the quiet coast recording against acceleration. Crossfades, a 35 Hz high-pass filter and a compressor soften transitions and control peaks. Original audio assets are retained.

Validation: `node --test tests/*.test.cjs`. Audio tests cover lift continuity, downshift hysteresis, sustain loops, brake priority, scheduled coast-to-brake playback, interruption cancellation and full source cleanup. A browser OfflineAudioContext render using the actual MP3s also exercised acceleration, a half-second lift, reapplication, braking and extended coasting; output levels stayed below digital clipping. Subjective timbre still depends on the source recordings and playback equipment.
