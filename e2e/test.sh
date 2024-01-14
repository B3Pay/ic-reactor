#!/usr/bin/env bash
dfx stop
set -e
# trap 'dfx stop' EXIT

echo "===========SETUP========="
dfx start --background --clean
dfx deploy hello_actor 
dfx generate hello_actor
source .env
yarn install
echo "===========SETUP DONE========="

echo "===========TESTING========="
jest
echo "===========TESTING DONE========="

echo "DONE"