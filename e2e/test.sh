#!/usr/bin/env bash
set -euo pipefail
trap 'icp network stop >/dev/null 2>&1 || true' EXIT

echo "===========SETUP========="
icp network start -d
icp deploy hello_actor
pnpm install
echo "===========SETUP DONE========="

echo "===========VERIFYING DEPLOYMENT========="
icp canister call hello_actor greet '("World")'
echo "===========VERIFICATION DONE========="

echo "===========TESTING========="
# Export canister/network env expected by tests and generated declarations
CANISTER_ID_HELLO_ACTOR="$(icp canister status hello_actor -i | tr -d '[:space:]')"
export CANISTER_ID_HELLO_ACTOR
export CANISTER_ID="$CANISTER_ID_HELLO_ACTOR"
export DFX_NETWORK=local
export IC_HOST=http://127.0.0.1:8000

npx vitest run
echo "===========TESTING DONE========="

echo "DONE"
