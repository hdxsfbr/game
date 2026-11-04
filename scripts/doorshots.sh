#!/usr/bin/env bash
# One screenshot per door and gate, taken from two tiles away on the passage side, to review their facing.
# Usage: scripts/doorshots.sh [outDir] [baseUrl]
set -uo pipefail
cd "$(dirname "$0")/.."
out="${1:-scratch/doors}"; base="${2:-https://localhost:5182}"
mkdir -p "$out"
python3 scripts/doors.py --spots | grep '^SPOT' | while read -r _ area x y name; do
  for i in 1 2 3; do
    node scripts/inspect3d.mjs "$base" "$area" --quiet --query "x=$x&y=$y" --wait 1000 --shot "$out/$area-$name.png" 2>&1 | grep -v "Failed to load resource"
    [ "${PIPESTATUS[0]}" = 0 ] && break; sleep 2
  done
  echo "$area $name"
done
