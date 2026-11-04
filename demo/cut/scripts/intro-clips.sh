#!/usr/bin/env bash
# Cuts Yara's phone clips in intro/ (git-ignored) into the short, upright, silent clips the §1 versions use, in public/intro/.
set -euo pipefail
cd "$(dirname "$0")/.."
I=intro O=public/intro
mkdir -p $O
cut() { ffmpeg -v error -y -ss "$2" -t "$3" -i "$I/$1" -an -vf "fps=30,scale=${6:-720}:-2,setsar=1${5:+,$5}" -c:v libx264 -crf 17 -preset slow -pix_fmt yuv420p "$O/$4.mp4"; }
cut 'WhatsApp Video 2026-11-04 at 7.56.02 PM.mp4' 57 10 brush-cat           # fine brush on the gold, the cat on the couch
cut 'WhatsApp Video 2026-11-04 at 7.56.02 PM.mp4' 18 10 brush-gold          # lower in the gold band
cut 'WhatsApp Video 2026-11-04 at 7.56.01 PM.mp4' 66 10 brush-purple        # wide brush on the purple
cut 'WhatsApp Video 2026-11-04 at 7.55.59 PM.mp4' 2.5 6 knife-white         # knife laying white paste
cut 'WhatsApp Video 2026-11-04 at 7.56.00 PM (2).mp4' 1 9.5 knife-purple    # knife on the purple
cut 'WhatsApp Video 2026-11-04 at 7.56.00 PM (1).mp4' 0 7.8 ridges          # dark ridges up close
cut 'WhatsApp Video 2026-11-04 at 7.55.59 PM (1).mp4' 0 4.7 texture         # white paste texture
cut 'WhatsApp Video 2026-11-04 at 8.20.20 PM.mp4' 0 3 blank-live '' 960   # the blank canvas and her supplies, the cat walking past (landscape)
cut 'WhatsApp Video 2026-11-04 at 8.21.52 PM.mp4' 0 12.5 wall               # the purple and gold painting finished, on the wall, pulling back
# Mixing: black, red, white squeezed in, then the stir, three times faster.
M='WhatsApp Video 2026-11-04 at 7.56.00 PM.mp4'
ffmpeg -v error -y -i "$I/$M" -an -filter_complex "\
[0]trim=16.5:20.5,setpts=PTS-STARTPTS[a];[0]trim=31.5:35.5,setpts=PTS-STARTPTS[b];\
[0]trim=70.5:75,setpts=PTS-STARTPTS[c];[0]trim=79:87.8,setpts=PTS-STARTPTS[d];\
[a][b][c][d]concat=n=4:v=1,setpts=PTS/3,fps=30,scale=720:-2,setsar=1[v]" -map "[v]" -c:v libx264 -crf 17 -preset slow -pix_fmt yuv420p $O/mix.mp4
# Photos, upright and smaller.
ph() { ffmpeg -v error -y -i "$I/$1" -vf "scale=-2:1600" -q:v 3 "$O/$2.jpg"; }
ph 'WhatsApp Image 2026-11-04 at 7.55.50 PM.jpeg' blank-1
ph 'WhatsApp Image 2026-11-04 at 7.55.52 PM.jpeg' blank-2
ph 'WhatsApp Image 2026-11-04 at 7.55.54 PM (1).jpeg' tube
ph 'WhatsApp Image 2026-11-04 at 7.55.54 PM.jpeg' textured
ph 'WhatsApp Image 2026-11-04 at 8.22.43 PM.jpeg' wall-photo
