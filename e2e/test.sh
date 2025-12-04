#!/usr/bin/env bash
dfx stop
set -e
trap 'dfx stop' EXIT

echo "===========SETUP========="
dfx start --background --clean
dfx deploy hello_actor 
dfx generate hello_actor
bun install
echo "===========SETUP DONE========="

echo "===========VERIFYING DEPLOYMENT========="
dfx canister call hello_actor greet '("World")'
echo "===========VERIFICATION DONE========="

echo "===========TESTING========="
source .env
export IC_HOST=http://127.0.0.1:4943
bun test src/test/react.test.tsx
echo "===========TESTING DONE========="

echo "DONE"