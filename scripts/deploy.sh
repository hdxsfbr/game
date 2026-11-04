#!/usr/bin/env bash
# Deploy the current checkout to the Railway `game` service by CLI upload.
#
#   scripts/deploy.sh            upload, wait for the build, smoke-test the live URL
#   scripts/deploy.sh --no-smoke upload and wait only
#
# The tracked files are copied to a plain folder first: `railway up` resolves the git root
# through a worktree's `.git` file and would otherwise upload the main checkout.
set -euo pipefail
cd "$(dirname "$0")/.."
PROJECT=7cabebc8-5189-41dc-92e3-cd670e4f3745
SERVICE=game
URL=https://game-production-34da.up.railway.app
SMOKE=1
[[ "${1:-}" == "--no-smoke" ]] && SMOKE=0

npm run build
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
git ls-files -z | xargs -0 -I{} cp --parents {} "$STAGE"/
ID=$(cd "$STAGE" && railway up --project "$PROJECT" --environment production --service "$SERVICE" --detach < /dev/null | sed -n 's/.*id=\([0-9a-f-]*\).*/\1/p')
[[ -n "$ID" ]] || { echo "upload failed: no deployment id" >&2; exit 1; }
echo "deployment $ID"
for _ in $(seq 1 60); do
  STATUS=$(railway deployment list --service "$SERVICE" | grep "$ID" | awk -F'|' '{gsub(/ /,"",$2); print $2}')
  echo "  $STATUS"
  case "$STATUS" in SUCCESS) break ;; FAILED|CRASHED|REMOVED) echo "deploy $STATUS" >&2; exit 1 ;; esac
  sleep 15
done
[[ "$STATUS" == SUCCESS ]] || { echo "timed out waiting for the deploy" >&2; exit 1; }
LIVE=$(curl -s "$URL/?v=$RANDOM" | grep -o 'assets/index-[^"]*\.js' | head -1)
LOCAL=$(ls dist/assets | grep '^index-.*\.js$' | head -1)
echo "live bundle $LIVE, local dist/assets/$LOCAL"
[[ "$LIVE" == "assets/$LOCAL" ]] || { echo "live bundle does not match the local build" >&2; exit 1; }
[[ $SMOKE == 1 ]] && SMOKE_READY_MS="${SMOKE_READY_MS:-90000}" node scripts/smoke.mjs "$URL"
