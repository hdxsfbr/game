#!/usr/bin/env bash
# Rebuild the 3D world and the placeholder character with headless Blender.
# Usage: scripts/blender/build.sh [area ...]     (no arguments: every area and the mannequin)
# Blender 4.x lives in ~/.local/opt/blender unless BLENDER points elsewhere.
set -euo pipefail
cd "$(dirname "$0")/../.."
BLENDER="${BLENDER:-$HOME/.local/opt/blender/blender}"
if [ $# -eq 0 ]; then
  "$BLENDER" -b -P scripts/blender/build_area.py -- --all 2>&1 | grep -E '^wrote|Error|Traceback' || true
  "$BLENDER" -b -P scripts/blender/build_mannequin.py 2>&1 | grep -E '^wrote|Error|Traceback' || true
else
  args=()
  for a in "$@"; do args+=(--area "$a"); done
  "$BLENDER" -b -P scripts/blender/build_area.py -- "${args[@]}" 2>&1 | grep -E '^wrote|Error|Traceback' || true
fi
