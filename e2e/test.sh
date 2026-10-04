#!/usr/bin/env bash
# Runs the e2e suite on a fresh local network: start it, deploy hello_actor,
# run vitest, and stop the network again, also when a step fails.
#
# Needs `pnpm install` and `pnpm build` at the repository root first (the
# suite imports the built packages), and Rust with the wasm32-unknown-unknown
# target for the canister build.
set -euo pipefail
cd "$(dirname "$0")"

# The icp-cli and ic-wasm this package pins come first on PATH, in CI as
# locally; a global install of the same version is only a fallback. Any other
# version does not work: the network launcher and the project format in
# icp.yaml are 1.2.0's.
export PATH="$PWD/node_modules/.bin:$PATH"
expected="$(node -p 'require("./package.json").devDependencies["@icp-sdk/icp-cli"]')"
actual="$(icp --version | awk '{ print $2 }')"
if [ "$actual" != "$expected" ]; then
  echo "e2e needs icp-cli $expected, but \`icp\` on PATH is ${actual:-missing}. Run \`pnpm install\` at the repository root." >&2
  exit 1
fi
echo "icp $actual, $(ic-wasm --version)"

echo "===========CHECKING DECLARATIONS========="
# src/declarations is what `candid-core-cli gen` writes from the .did.
pnpm gen:check

stop_network() {
  echo "===========STOPPING NETWORK========="
  icp network stop || true
}
trap stop_network EXIT

echo "===========SETUP========="
icp network start -d
icp deploy hello_actor
echo "===========SETUP DONE========="

echo "===========VERIFYING DEPLOYMENT========="
icp canister call hello_actor greet '("World")'
echo "===========VERIFICATION DONE========="

echo "===========TESTING========="
pnpm exec vitest run
echo "===========TESTING DONE========="

echo "DONE"
