#!/usr/bin/env bash
# Render the game in headless Chrome, save a screenshot, and print console errors.
# Usage: scripts/smoke.sh [url] [out.png]
# Defaults: https://localhost:5180/ and scratch/smoke.png
set -euo pipefail
URL="${1:-https://localhost:5180/}"
OUT="${2:-scratch/smoke.png}"
mkdir -p "$(dirname "$OUT")"
LOG="${OUT%.png}.log"
CH="$(command -v google-chrome || command -v chromium || command -v chromium-browser)"
timeout 60 "$CH" --headless=new --disable-gpu --use-gl=swiftshader --enable-unsafe-swiftshader \
  --window-size=1280,720 --ignore-certificate-errors --virtual-time-budget=4000 --enable-logging=stderr --v=0 \
  --screenshot="$OUT" "$URL" > "$LOG" 2>&1 < /dev/null || true
echo "screenshot: $OUT"
echo "--- console (errors/uncaught) ---"
grep -E "CONSOLE" "$LOG" | grep -iE "error|uncaught|failed" | grep -v "GL Driver Message" || echo "(none)"
