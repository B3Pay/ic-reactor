#!/usr/bin/env bash
dfx stop
set -e
trap 'dfx stop' EXIT

echo "===========SETUP========="
dfx start --background --clean
dfx deploy hello_actor 
dfx generate hello_actor
pnpm install
echo "===========SETUP DONE========="

echo "===========VERIFYING DEPLOYMENT========="
dfx canister call hello_actor greet '("World")'
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