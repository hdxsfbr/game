#!/usr/bin/env bash
# A screenshot of every place worth looking at, in every area, with the kingdom in colour: the start, each
# door and gate from two tiles away, the bench, the people and props, the stage, the fragment and the exits.
# For the visual review that closes any change to the world, the people or the camera. Look at every image.
# Usage: scripts/reviewshots.sh [outDir] [baseUrl] [area]
set -uo pipefail
cd "$(dirname "$0")/.."
out="${1:-scratch/review}"; base="${2:-https://localhost:5182}"; only="${3:-}"
mkdir -p "$out"
spots=$(python3 scripts/doors.py --spots-all)
progress=$(echo "$spots" | sed -n 's/^PROGRESS //p')
echo "$spots" | grep '^SPOT' | while read -r _ area x y name kind; do
  [ -n "$only" ] && [ "$only" != "$area" ] && continue
  f="$out/$area-$name.png"
  for i in 1 2 3; do
    node scripts/inspect3d.mjs "$base" "$area" --quiet --query "x=$x&y=$y" --progress "$progress" --wait 2000 --shot "$f" > "$out/last.log" 2>&1 && break
    sleep 2
  done
  [ -f "$f" ] && echo "$area $name ($x,$y)" || echo "FAILED $area $name"
done
# People are small at game zoom: a 3x crop around the middle of each person's shot, so faces, facing and
# instruments can be judged, not guessed at.
echo "$spots" | grep '^SPOT' | while read -r _ area x y name kind; do
  case "$kind" in npc|prop) ;; *) continue;; esac
  [ -n "$only" ] && [ "$only" != "$area" ] && continue
  f="$out/$area-$name.png"; [ -f "$f" ] || continue
  python3 -I -c "
from PIL import Image; import sys
im = Image.open(sys.argv[1]); w, h = im.size
im.crop((w//2 - 220, h//2 - 200, w//2 + 220, h//2 + 60)).resize((1320, 780), Image.LANCZOS).save(sys.argv[2])" "$f" "$out/$area-$name-zoom.png"
done
