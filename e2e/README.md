# End-to-End Test Workspace

This directory contains a small `hello_actor` canister and a suite of `vitest`
based tests that exercise the core runtime in a local replica.

## Running tests

- `pnpm start` or `pnpm test` _(both now identical)_ will:
  1. start a local dfx network
  2. deploy the `hello_actor` canister
  3. source the generated `.env` file
  4. execute `vitest run` against `src/test`
  5. stop the replica

The `test` script used to invoke `vitest` directly which caused a confusing
`CANISTER_ID_HELLO_ACTOR is missing` error when the `.env` file wasn't
present. The package has been updated so `pnpm test` now wraps the full setup
sequence; you can still run `vitest` manually if you prefer, but make sure you
have deployed and/or sourced the `.env` yourself.

## Troubleshooting

- If you ever see an error about `CANISTER_ID_HELLO_ACTOR` not being set,
  either run `pnpm start`/`test` or deploy the canister with `dfx` and source
  the resulting `.env` file. The Vitest config will attempt to read the
  canister id from `.dfx/local/canister_ids.json` as a last resort.
