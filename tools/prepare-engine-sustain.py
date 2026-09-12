"""Reconstruct acceleration sustain from recorded harmonic/noise spectra.

Usage: python3 tools/prepare-engine-sustain.py ORIGINAL_BANK OUTPUT_BANK
Requires numpy/scipy. Use the initial pitch-stable bank, not granular textures.
Only on-* assets change. No short fragments or envelope joins are repeated.
"""
import sys, json
from pathlib import Path
import numpy as np
from scipy import signal, ndimage
from scipy.io import wavfile

source,dest=map(Path,sys.argv[1:3])
if source.resolve()==dest.resolve():
    raise ValueError('Keep original input separate')
anchors={r['name']:r['hz'] for r in json.loads((dest/'regions.json').read_text())}
report=[]
for index,path in enumerate(sorted(source.glob('on-*.wav'))):
    sr,raw=wavfile.read(path)
    x=raw.astype(float)/32768
    hz=anchors[path.stem]
    f,p=signal.welch(x,sr,nperseg=min(8192,len(x)),noverlap=min(6144,len(x)//2))
    df=f[1]-f[0]
    # Separate broad recorded texture from narrow engine harmonics. Copy the
    # measured energy of each harmonic, but give it a continuous shared phase.
    floor=ndimage.median_filter(p,size=max(3,int(hz*.45/df)//2*2+1))
    floor=ndimage.gaussian_filter1d(floor,20/df)
    cycles=round(hz*16)
    count=round(cycles*sr/hz)
    actual=cycles*sr/count
    freq=np.fft.rfftfreq(count,1/sr)
    rng=np.random.default_rng(126+index)
    noise_psd=np.interp(freq,f,floor)
    noise_psd[freq<40]=0
    spectrum=np.sqrt(noise_psd*sr*count/2)*np.exp(1j*rng.uniform(-np.pi,np.pi,len(freq)))
    spectrum[0]=0
    for harmonic in range(1,int(12000/hz)+1):
        center=harmonic*hz
        radius=min(hz*.38,max(12,center*.025))
        region=np.abs(f-center)<radius
        energy=np.sum(np.maximum(0,p[region]-floor[region]))*df
        # Same harmonic phase for every register prevents cancellation during
        # RPM crossfades. Integer FFT bins make the whole bed seam-free.
        phase=(harmonic*harmonic*2.399963229728653)%(2*np.pi)
        spectrum[harmonic*cycles]+=np.sqrt(2*energy)*count/2*np.exp(1j*phase)
    y=np.fft.irfft(spectrum,n=count)
    # Slow stochastic fluctuations can beat against the harmonics even though
    # there are no joins. Remove only the 5–20 Hz amplitude flutter; retain
    # slower texture movement and fast engine firing detail.
    power=ndimage.uniform_filter1d(y*y,round(.012*sr),mode='wrap')
    fast=ndimage.gaussian_filter1d(power[::120],2.0,mode='wrap')
    slow=ndimage.gaussian_filter1d(fast,24.0,mode='wrap')
    correction=np.sqrt((slow+1e-12)/(fast+1e-12))
    correction=np.clip(correction,.65,1.55)
    gain=np.interp(np.arange(count),np.arange(len(correction))*120,correction,
                   period=count)
    y*=gain
    y*=min(.1/np.sqrt(np.mean(y*y)),.65/np.max(np.abs(y)))
    wavfile.write(dest/path.name,sr,np.int16(y*32767))
    def pulse(a):
        envelope=np.sqrt(np.mean(a[:len(a)//240*240].reshape(-1,240)**2,axis=1))
        ff,pp=signal.welch(envelope/np.mean(envelope),200,nperseg=min(1024,len(envelope)))
        return float(np.sqrt(np.sum(pp[(ff>=5)&(ff<=20)])*(ff[1]-ff[0])))
    entry=dict(name=path.stem,hz=actual,seconds=count/sr,modulation_5_20_hz=pulse(y))
    report.append(entry)
    print(entry)
(dest/'sustain-preparation.json').write_text(json.dumps(report,indent=2)+'\n')
