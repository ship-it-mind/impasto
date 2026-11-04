#!/usr/bin/env bash
# Yara's two on-camera clips (git-ignored folders) → public/yara/, trimmed to her words, 30 fps, with sound.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/yara
enc() { ffmpeg -v error -y -ss "$2" -t "$3" -i "$1" -vf fps=30 -c:v libx264 -crf 17 -preset slow -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 "$4"; }
enc yara-on-camera-1/*.mp4 0.3 16.6 public/yara/yara-1.mp4   # §2: the questions
enc yara-on-camera-2/*.mp4 0 21.5 public/yara/yara-2.mp4     # §8: her last word
