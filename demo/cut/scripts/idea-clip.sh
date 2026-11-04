#!/usr/bin/env bash
# The idea scene from the user's recording of the live app (demo/video/new-video/, git-ignored):
# the box filling, dictation, the brief, sizing on the wall, and "From the picture". The two file
# pickers and the wait while it reads are cut, slow parts sped up, and the top bar (his name) cropped off.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=$(ls ../video/new-video/*.mp4 | head -1)
# start end speed
P=("4.2 5.5 1.5" "6.9 8.6 1.5" "8.6 22.9 9" "22.9 25.6 1.6" "51.8 54.0 1.5" "100.0 119.5 9" "119.5 124.0 2")
F=""; L=""; i=0
for p in "${P[@]}"; do read -r a b s <<<"$p"
  F+="[0:v]trim=$a:$b,setpts=(PTS-STARTPTS)/$s,fps=30,crop=718:404:57:28,scale=1436:808:flags=lanczos,setsar=1[v$i];"; L+="[v$i]"; i=$((i+1)); done
ffmpeg -v error -y -i "$SRC" -filter_complex "${F}${L}concat=n=$i:v=1[out]" -map "[out]" -an -c:v libx264 -crf 16 -preset slow -pix_fmt yuv420p public/clips/01-idea-live.mp4
ffprobe -v error -count_frames -select_streams v -show_entries stream=nb_read_frames -of csv=p=0 public/clips/01-idea-live.mp4
