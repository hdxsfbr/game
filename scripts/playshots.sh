#!/usr/bin/env bash
# Screenshots for the 2026-11-03 playtest notes (docs/playtest-2026-11-03.md), plus a peak-level
# measurement of the Harmony Bench chord demo. Usage: scripts/playshots.sh [outDir] [baseUrl]
set -uo pipefail
cd "$(dirname "$0")/.."
out="${1:-scratch/playtest}"; base="${2:-https://localhost:5181}"
mkdir -p "$out"
try() { for i in 1 2 3; do node scripts/inspect3d.mjs "$@" 2>&1 | grep -v "Failed to load resource"; [ "${PIPESTATUS[0]}" = 0 ] && return 0; sleep 2; done; echo "failed: $*"; }
PART='{"solved":["hub-unison","valley-octave","valley-fifth","town-bell","town-stall-sol","town-stall-mi"],"cardsSeen":["hub","valley","town","jazz","stage"]}'
try "$base" valley --quiet --query "x=40&y=16" --wait 1200 --shot "$out/valley-bridge-door.png"
try "$base" valley --quiet --query "x=17&y=6" --wait 1200 --shot "$out/valley-tree-doors.png"
try "$base" hub --quiet --query "x=9&y=8" --wait 1200 --shot "$out/hub-door.png"
try "$base" town --quiet --query "x=22&y=18" --progress "$PART" --wait 800 --eval "w.mapView.show(w.area); return 'shown'" --wait 600 --shot "$out/town-map-partial.png"
SOLVED='{"solved":["hub-unison"],"drilled":["hub"],"cardsSeen":["hub","valley","town","jazz","stage"]}'
try "$base" hub --quiet --query "x=9&y=8" --progress "$SOLVED" --wait 1200 --shot "$out/hub-door-opened.png"
# Peak of the four-chord demo on the output bus (1.0 would clip). Prints {pre, series:[[t, peak]...]}.
try "$base" jazz --quiet --query "x=6&y=14" --eval "const a=window.__lkAudio; const an=a.ctx.createAnalyser(); an.fftSize=2048; a.duck.connect(an); const buf=new Float32Array(2048); window.__peak={pre:0, series:[]}; const t0=a.ctx.currentTime; window.__pk=setInterval(()=>{an.getFloatTimeDomainData(buf); let m=0; for (const v of buf) m=Math.max(m,Math.abs(v)); window.__peak.pre=Math.max(window.__peak.pre,m); window.__peak.series.push([+(a.ctx.currentTime-t0).toFixed(2), +m.toFixed(2)]);},50); w.playDemo({heading:'',text:'',demo:{chords:[[0,4,7,11],[0,3,7,10],[0,4,7,10],[0,3,6,10]],gap:1.1}}); return 'started'" --wait 4000 --eval "clearInterval(window.__pk); return window.__peak.pre"
ls "$out"
