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
npx vitest run
echo "===========TESTING DONE========="

echo "DONE"
