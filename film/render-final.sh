#!/bin/zsh
# The final film: rendered at 480 fps, then 6 of every 8 frames averaged into each 60 fps frame, which is
# real motion blur on everything, shaders and all.
set -e
cd "${0:A:h}"
node scripts/scan.mjs
uv run audio/make_track.py
mkdir -p out
time npx remotion render src/index.ts Film out/raw-480.mp4 --gl=vulkan --props='{"fps":480}' --crf=13 --concurrency=16 --muted --log=error --color-space=bt709 --jpeg-quality=96
ffmpeg -y -loglevel error -stats -i out/raw-480.mp4 -i public/track.wav \
  -vf "tmix=frames=6:weights='1 1 1 1 1 1',framestep=8,noise=c0s=2:c0f=t+u,format=yuv420p" -r 60 \
  -c:v libx264 -preset slow -crf 15 -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -c:a aac -b:a 320k -shortest -movflags +faststart out/impasto-film.mp4
rm -f out/raw-480.mp4
ls -la out
