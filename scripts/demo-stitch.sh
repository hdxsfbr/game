#!/usr/bin/env bash
# Assemble the demo video from scripts/demo.mjs's clips and cards and scripts/demo-narration.py's
# narration: every scene is re-encoded to one uniform intermediate (1280x720, 30 fps, AAC 48 kHz),
# the narration mixed over the game's sound (ducked to 30% while the voice speaks), a card held for
# its own length or the narration's plus a breath, a clip shorter than its narration held on its last
# frame; then the scenes are concatenated.
# Usage: scripts/demo-stitch.sh [dir] [out.mp4]      (dir holds NN-*.mp4, NN-card.png + .seconds, narration/NN.mp3)
set -euo pipefail
dir=${1:-scratch/demo}
outfile=${2:-$dir/listening-kingdom-demo.mp4}
work=$dir/.stitch
mkdir -p "$work"
: > "$work/list.txt"
dur() { ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$1"; }
for n in 01 02 03 04 05 06 07 08 09 10; do
  nar=$dir/narration/$n.mp3
  nd=0; [ -f "$nar" ] && nd=$(dur "$nar")
  seg=$work/$n.mp4
  card=$(ls "$dir"/$n-*.png 2>/dev/null | head -1 || true)
  if [ -n "$card" ]; then
    secs=$(cat "${card%.png}.seconds")
    len=$(python3 -c "print(max($secs, $nd + 1.2))")
    if [ -f "$nar" ]; then
      ffmpeg -y -loglevel error -loop 1 -framerate 30 -t "$len" -i "$card" -i "$nar" -f lavfi -t "$len" -i anullsrc=r=48000:cl=stereo \
        -filter_complex "[1:a]adelay=500|500,aformat=sample_rates=48000:channel_layouts=stereo[n];[2:a][n]amix=inputs=2:normalize=0:duration=first[a]" \
        -map 0:v -map "[a]" -vf "scale=1280:720,format=yuv420p,fade=t=in:st=0:d=0.5,fade=t=out:st=$(python3 -c "print($len-0.5)"):d=0.5" -r 30 -c:v libx264 -preset medium -crf 20 -c:a aac -b:a 160k -ar 48000 -t "$len" "$seg"
    else
      ffmpeg -y -loglevel error -loop 1 -framerate 30 -t "$len" -i "$card" -f lavfi -t "$len" -i anullsrc=r=48000:cl=stereo \
        -map 0:v -map 1:a -vf "scale=1280:720,format=yuv420p" -r 30 -c:v libx264 -preset medium -crf 20 -c:a aac -b:a 160k -ar 48000 -t "$len" "$seg"
    fi
  else
    clip=$(ls "$dir"/$n-*.mp4 2>/dev/null | head -1 || true)
    [ -n "$clip" ] || { echo "scene $n: no clip, skipped"; continue; }
    cd=$(dur "$clip")
    len=$(python3 -c "print(max($cd, $nd + 1.0))")
    pad=$(python3 -c "print(max(0, $len - $cd))")
    if [ -f "$nar" ]; then
      duckend=$(python3 -c "print($nd + 0.8)")
      ffmpeg -y -loglevel error -i "$clip" -i "$nar" \
        -filter_complex "[0:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=enable='between(t,0,$duckend)':volume=0.3,apad=pad_dur=$pad[g];[1:a]adelay=400|400,aformat=sample_rates=48000:channel_layouts=stereo[n];[g][n]amix=inputs=2:normalize=0:duration=first[a];[0:v]tpad=stop_mode=clone:stop_duration=$pad,scale=1280:720,format=yuv420p[v]" \
        -map "[v]" -map "[a]" -r 30 -c:v libx264 -preset medium -crf 20 -c:a aac -b:a 160k -ar 48000 -t "$len" "$seg"
    else
      ffmpeg -y -loglevel error -i "$clip" -filter_complex "[0:a]aformat=sample_rates=48000:channel_layouts=stereo[a];[0:v]scale=1280:720,format=yuv420p[v]" \
        -map "[v]" -map "[a]" -r 30 -c:v libx264 -preset medium -crf 20 -c:a aac -b:a 160k -ar 48000 "$seg"
    fi
  fi
  echo "file '$(realpath "$seg")'" >> "$work/list.txt"
  printf '%s  %5.1f s\n' "$n" "$(dur "$seg")"
done
ffmpeg -y -loglevel error -f concat -safe 0 -i "$work/list.txt" -c copy -movflags +faststart "$outfile"
printf 'total %5.1f s -> %s\n' "$(dur "$outfile")" "$outfile"
