#!/usr/bin/env bash
# Fixed-viewpoint screenshots of Tonic Town and the Jazz Quarter, grey and in colour, for before/after comparisons.
# Usage: scripts/areashots.sh <outDir> [baseUrl]      (progress seeds live in scripts/progress/*.json)
set -uo pipefail
cd "$(dirname "$0")/.."
out="$1"; base="${2:-https://localhost:5182}"
mkdir -p "$out"
TOWN=$(cat scripts/progress/town.json); JAZZ=$(cat scripts/progress/jazz.json)
try() { for i in 1 2 3; do node scripts/inspect3d.mjs "$@" > /dev/null 2>&1 && return 0; sleep 2; done; echo "failed: $*"; }
try "$base" town --quiet --query "ao=on&x=22&y=18" --wait 1200 --shot "$out/town-grey.png"
try "$base" town --quiet --query "ao=on&x=22&y=18" --progress "$TOWN" --wait 1200 --shot "$out/town-colour.png"
try "$base" town --quiet --query "ao=on&x=14&y=11" --progress "$TOWN" --wait 1200 --shot "$out/town-colour-west.png"
try "$base" jazz --quiet --query "ao=on&x=20&y=15" --wait 1200 --shot "$out/jazz-grey.png"
try "$base" jazz --quiet --query "ao=on&x=20&y=15" --progress "$JAZZ" --wait 1200 --shot "$out/jazz-colour.png"
try "$base" jazz --quiet --query "ao=on&x=46&y=14" --progress "$JAZZ" --wait 1200 --shot "$out/jazz-colour-east.png"
ls "$out"
