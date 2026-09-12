# Recorded engine audio preview

The September 12 replacement uses the user's four new MP3 recordings:

| Purpose | Supplied file |
| --- | --- |
| Acceleration | 33e51ca2-6622-4e01-9a10-7312b6d8527a.mp3 |
| Braking / lift | 9c8de92e-cc24-4218-a2c0-ec3f89dfc4ce.mp3 |
| Short acceleration pull | 044f47c3-4b67-448a-864e-343ab350625d.mp3 |
| Idle | 090a0cf8-6dd2-46e6-a193-af34f7b4dd32.mp3 |

assets/audio/recorded-v2 contains five mono WAV regions. All active engine
audio comes from this new set. Old Williams assets remain unused.

The high-rev recording is a direct 7.13-second loop taken from 16.2–23.4 seconds
of the acceleration file. Idle is a direct 4.23-second loop. Each has a 70 ms
wrap crossfade and level adjustment. A 65 Hz high-pass reduces low rumble.
There is no harmonic/noise reconstruction, generated noise, or micro-grain
stitching in this bank.

The short burst supplies the lower loaded register. Two braking regions
supply unloaded registers. Those three source ramps are resampled according
to measured pitch before looping, so the recorded rise/fall does not repeat
inside a sustained note. This is waveform resampling, not spectral synthesis.
Their lengths and source boundaries are recorded in regions.json.

tools/prepare-recorded-engine.py rebuilds the bank from decoded 48 kHz mono
16-bit WAV files named acceleration.wav, burst.wav, braking.wav and idle.wav.
The supplied MP3s remain untouched.

engine-sound.js retains the existing speed-based gear thresholds, downshift
hysteresis, shift dips, throttle continuity and grid idle lock. Its pitch
range is calibrated to this recording's audible harmonics, not actual engine
RPM telemetry. Five continuous voices replace nine; idle is used only while
stationary/gridded. Releasing the pedal blends toward braking tone without
forcing an RPM drop. Home/restart/visibility cleanup remains intact.

Validation: all 48 tests pass, including grid idle, gear shifts, lift
continuity, muted-register pitch tracking and source cleanup. Inline scripts
parse. A 36-second browser OfflineAudioContext preview decoded all five WAVs
and exercised launch, shifting, sustained speed, coasting and braking.
Peak 0.360 and RMS 0.067; every sample finite. This is objective validation,
not a subjective listening claim. The preview is for user listening before
production promotion.
