#!/usr/bin/env bash
# Yara's two on-camera clips (git-ignored folders) → public/yara/, trimmed to her words, 30 fps, with sound.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/yara
# Her phone recorded her at about -37 LUFS, so the sound is brought up to -16 LUFS (two-pass loudnorm), with a little noise reduction.
enc() {
  local m; m=$(ffmpeg -hide_banner -ss "$2" -t "$3" -i "$1" -vn -af "highpass=f=80,afftdn=nf=-30,loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json" -f null - 2>&1 | sed -n '/^{/,/^}/p')
  local mi mtp mlra mth off
  mi=$(echo "$m" | sed -n 's/.*"input_i" : "\(.*\)".*/\1/p'); mtp=$(echo "$m" | sed -n 's/.*"input_tp" : "\(.*\)".*/\1/p')
  mlra=$(echo "$m" | sed -n 's/.*"input_lra" : "\(.*\)".*/\1/p'); mth=$(echo "$m" | sed -n 's/.*"input_thresh" : "\(.*\)".*/\1/p'); off=$(echo "$m" | sed -n 's/.*"target_offset" : "\(.*\)".*/\1/p')
  ffmpeg -v error -y -ss "$2" -t "$3" -i "$1" -vf fps=30 \
    -af "highpass=f=80,afftdn=nf=-30,loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=$mi:measured_TP=$mtp:measured_LRA=$mlra:measured_thresh=$mth:offset=$off:linear=true" \
    -c:v libx264 -crf 17 -preset slow -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 "$4"
}
enc yara-on-camera-1/*.mp4 0.3 16.6 public/yara/yara-1.mp4   # §2: the questions
enc yara-on-camera-2/*.mp4 0 21.5 public/yara/yara-2.mp4     # §8: her last word
