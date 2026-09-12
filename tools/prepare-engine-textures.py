"""Build longer, decorrelated engine beds from the supplied pitch-stable loops.

Usage: python3 tools/prepare-engine-textures.py INPUT_DIRECTORY OUTPUT_DIRECTORY
Requires numpy/scipy. Deterministic waveform-matched overlap-add; no AI model.
Keep the input bank separately so a rebuild never processes its own output.
"""
import json
import sys
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from scipy import signal, ndimage

source, dest = map(Path, sys.argv[1:3])
if source.resolve() == dest.resolve():
    raise ValueError("Input and output must be separate directories")
dest.mkdir(parents=True, exist_ok=True)
report = []
for index, path in enumerate(sorted(source.glob('*.wav'))):
    sr, raw = wavfile.read(path)
    x = raw.astype(float) / 32768
    if x.ndim != 1:
        raise ValueError("Expected prepared mono 16-bit WAV")
    if path.stem == 'idle':
        wavfile.write(dest/path.name, sr, raw)
        continue
    rng = np.random.default_rng(126 + index)
    old_rms = np.sqrt(np.mean(x*x))
    # Reduce the recorded slow loud/quiet gesture, retaining fine texture.
    envelope = np.sqrt(ndimage.uniform_filter1d(x*x, round(.025*sr), mode='wrap') + 1e-12)
    envelope = ndimage.gaussian_filter1d(envelope, .012*sr, mode='wrap')
    x *= np.clip((old_rms/envelope)**.7, .7, 1.4)
    target = round((12 + index*.37)*sr)
    grain = round(.15*sr)
    out = np.zeros(target + grain*3)
    start = int(rng.integers(0, len(x)-grain))
    out[:grain] = x[start:start+grain]
    end = grain
    while end < target+grain:
        # Irregular spacing removes a fixed grain-rate pulse. Search close to
        # a random source location for a phase-compatible waveform join.
        overlap = round(rng.uniform(.035, .055)*sr)
        advance = round(rng.uniform(.065, .105)*sr)
        length = overlap+advance
        ref = out[end-overlap:end-overlap+round(.012*sr)]
        candidate = int(rng.integers(0, len(x)-length-round(.016*sr)))
        search = x[candidate:candidate+round(.016*sr)+len(ref)]
        corr = signal.correlate(search, ref, mode='valid', method='fft')
        energy = np.convolve(search*search, np.ones(len(ref)), mode='valid')
        offset = int(np.argmax(corr/np.sqrt(energy+1e-12)))
        piece = x[candidate+offset:candidate+offset+length]
        fade = (.5-.5*np.cos(np.linspace(0,np.pi,overlap)))
        out[end-overlap:end] = out[end-overlap:end]*(1-fade)+piece[:overlap]*fade
        out[end:end+advance] = piece[overlap:]
        end += advance
    # Match the final join to the head, then remove the duplicated head fade.
    fade = round(.05*sr)
    search = out[target:target+round(.02*sr)+round(.012*sr)]
    ref = out[:round(.012*sr)]
    offset = int(np.argmax(signal.correlate(search, ref, mode='valid', method='fft')))
    cut = target+offset
    y = out[:cut+fade].copy()
    mix = .5-.5*np.cos(np.linspace(0,np.pi,fade))
    y[-fade:] = y[-fade:]*(1-mix)+y[:fade]*mix
    y = y[fade:]
    y *= min(old_rms/np.sqrt(np.mean(y*y)), .65/np.max(np.abs(y)))
    wavfile.write(dest/path.name,sr,np.int16(np.clip(y,-1,1)*32767))
    # Envelope correlation at the old loop period measures repeated gestures,
    # not the desired rapid periodic engine firing waveform.
    def repetition(a, lag):
        e = np.sqrt(np.mean(a[:len(a)//480*480].reshape(-1,480)**2,axis=1))
        return float(np.corrcoef(e[:-lag],e[lag:])[0,1])
    lag = round(len(x)/480)
    entry = dict(name=path.stem,old_seconds=round(len(x)/sr,3),
                 seconds=round(len(y)/sr,3),
                 old_period_envelope_correlation=round(repetition(y,lag),3))
    report.append(entry)
    print(entry)
(dest/'texture-preparation.json').write_text(json.dumps(report,indent=2)+'\n')
