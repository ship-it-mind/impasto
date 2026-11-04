#!/usr/bin/env bash
# The idea scene from the user's recording of the live app (demo/video/new-video/, git-ignored):
# the box filling, dictation, the brief, sizing on the wall, and "From the picture". The two file
# pickers and the wait while it reads are cut, slow parts sped up, and the top bar (his name) cropped off.
set -euo pipefail
cd "$(dirname "$0")/.."
# The original screen recording (.mov, 3024 × 1580) if it is there, else the smaller WhatsApp copy.
SRC=$(ls ../video/new-video/*.mov ../video/new-video/*.mp4 2>/dev/null | head -1)
# start end speed
# Timed to the voiceover: the dictation runs under "Yara says it out loud", the brief appears on "Impasto turns what she said into a brief".
P=("4.2 5.5 1" "6.9 8.6 1" "8.6 22.9 6.5" "22.9 25.6 1" "51.8 54.0 1" "100.0 119.5 12" "119.5 124.0 3")
F=""; L=""; i=0
for p in "${P[@]}"; do read -r a b s <<<"$p"
  F+="[0:v]trim=$a:$b,setpts=(PTS-STARTPTS)/$s,fps=30,crop=iw*0.86298:ih*0.93519:iw*0.06851:ih*0.06481,scale=1920:1080:flags=lanczos,setsar=1[v$i];"; L+="[v$i]"; i=$((i+1)); done
ffmpeg -v error -y -i "$SRC" -filter_complex "${F}${L}concat=n=$i:v=1[out]" -map "[out]" -an -c:v libx264 -crf 16 -preset slow -pix_fmt yuv420p public/clips/01-idea-live.mp4
ffprobe -v error -count_frames -select_streams v -show_entries stream=nb_read_frames -of csv=p=0 public/clips/01-idea-live.mp4
