# Turns the screencast frames record-example.mjs saves into a steady 30 fps clip.
import sys, os, re, subprocess
d, out = sys.argv[1], sys.argv[2]
lines = open(f'{d}/list.txt').read().split('\n')
files, durs = [], []
for l in lines:
    if l.startswith('file'): files.append(l[6:-1])
    elif l.startswith('duration'): durs.append(float(l.split()[1]))
files = files[:len(durs)]
seq = f'{d}/seq'; os.makedirs(seq, exist_ok=True)
for f in os.listdir(seq): os.remove(f'{seq}/{f}')
t, n, ends = 0.0, 0, []
acc = 0
for dur in durs: acc += dur; ends.append(acc)
i = 0
total = ends[-1]
while n / 30 < total:
    tt = n / 30
    while i < len(ends) - 1 and ends[i] <= tt: i += 1
    os.link(files[i], f'{seq}/{n:05d}.jpg'); n += 1
subprocess.run(['ffmpeg','-v','error','-y','-framerate','30','-i',f'{seq}/%05d.jpg','-c:v','libx264','-crf','14','-preset','slow','-pix_fmt','yuv420p',out], check=True)
print(out, n, 'frames')
