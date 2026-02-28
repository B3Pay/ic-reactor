#!/usr/bin/env bash
set -e
trap 'icp network stop' EXIT

echo "===========SETUP========="
icp network start -d
icp deploy hello_actor 
pnpm install
echo "===========SETUP DONE========="

echo "===========VERIFYING DEPLOYMENT========="
icp canister call hello_actor greet '("World")'
echo "===========VERIFICATION DONE========="

echo "===========TESTING========="
# Source and export all environment variables
set -a
source .env
set +a
export IC_HOST=http://127.0.0.1:4943
npx vitest run
echo "===========TESTING DONE========="

echo "DONE"