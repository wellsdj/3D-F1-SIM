"""Prepare the four September 12 user recordings without spectral resynthesis.
Usage: python3 tools/prepare-recorded-engine.py DECODED_WAV_DIRECTORY OUTPUT
Input names: idle.wav, acceleration.wav, burst.wav, braking.wav.
Only idle/high sustain use straight cuts; ramp regions use measured pitch
resampling to avoid repeating the recorded rise/fall inside a sustained note.
"""
import sys,json
from pathlib import Path
import numpy as np
from scipy import signal,ndimage
from scipy.io import wavfile
source,dest=map(Path,sys.argv[1:3]);dest.mkdir(parents=True,exist_ok=True)
regions=[
 ('idle','idle',.3,4.6,428,False),
 ('on-low','burst',.15,1.42,455,True),
 ('on-high','acceleration',16.2,23.4,586,False),
 ('off-low','braking',2.8,5.08,335,True),
 ('off-high','braking',.24,1.65,478,True)]
report=[]
for name,filename,start,end,anchor,stabilize in regions:
 sr,raw=wavfile.read(source/(filename+'.wav'))
 x=raw[round(start*sr):round(end*sr)].astype(float)/32768
 x=signal.sosfilt(signal.butter(2,65,fs=sr,btype='highpass',output='sos'),x)
 if stabilize:
  f,t,s=signal.spectrogram(x,sr,nperseg=4096,noverlap=3584)
  ix=np.flatnonzero((f>anchor*.68)&(f<anchor*1.36))
  peaks=ix[np.argmax(s[ix],axis=0)]
  log=np.log(s+1e-15);cols=np.arange(len(t))
  a,b,c=log[peaks-1,cols],log[peaks,cols],log[peaks+1,cols]
  correction=np.clip(.5*(a-c)/(a-2*b+c),-.5,.5)
  pitch=ndimage.gaussian_filter1d(ndimage.median_filter((peaks+correction)*sr/4096,3),1)
  phase=np.cumsum(np.interp(np.arange(len(x))/sr,t,pitch)/anchor)/sr
  phase-=phase[0]
  x=np.interp(np.arange(int(phase[-1]*sr))/sr,phase,x)
 # One short wrap crossfade per complete recording region, no micro-grains.
 fade=round(.07*sr);w=.5-.5*np.cos(np.linspace(0,np.pi,fade))
 x[-fade:]=x[-fade:]*(1-w)+x[:fade]*w
 x=x[fade:]
 target=.06 if name=='idle' else .095
 x*=min(target/np.sqrt(np.mean(x*x)),.65/np.max(np.abs(x)))
 wavfile.write(dest/(name+'.wav'),sr,np.int16(x*32767))
 entry=dict(name=name,source=filename+'.wav',start=start,end=end,hz=anchor,
            pitch_resampled=stabilize,seconds=round(len(x)/sr,4))
 report.append(entry);print(entry)
(dest/'regions.json').write_text(json.dumps(report,indent=2)+'\n')
