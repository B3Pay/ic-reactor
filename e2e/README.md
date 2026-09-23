# End-to-End Test Workspace

This directory contains a small `hello_actor` canister and a suite of `vitest`
based tests that run `@ic-reactor/core`, `@ic-reactor/candid` and
`@ic-reactor/react` against it on a local replica.

## The canister

Besides `greet` and `greet_update`, each method in `src/actor/src/lib.rs` puts
one kind of value, or one kind of failure, on the wire:

| Method      | Signature                                                | Covers                                                                                                                                                           |
| ----------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `divide`    | `(nat, nat) -> (variant { Ok : nat; Err : text }) query` | Both arms of a Result. A zero divisor returns `Err`.                                                                                                             |
| `profile`   | `(principal) -> (Profile) query`                         | A record of `principal`, `nat`, `nat64`, `int`, `vec text`, `opt blob` and a variant. The anonymous principal gets no avatar and the `Frozen` arm with its text. |
| `increment` | `() -> (nat)`                                            | A stateful update call.                                                                                                                                          |
| `count`     | `() -> (nat) query`                                      | A query that reads what `increment` wrote.                                                                                                                       |
| `boom`      | `() -> ()`                                               | A trap, which the replica rejects.                                                                                                                               |
| `whoami`    | `() -> (principal) query`                                | The caller, for the identity switch.                                                                                                                             |

`src/actor/hello_actor.did` is written by hand, so change it together with
`lib.rs`. The build embeds it as the canister's public `candid:service`
metadata, which the `@ic-reactor/candid` tests fetch at run time, and the vite
plugin regenerates `src/declarations/` from it each time vitest starts. Commit
the regenerated declarations.

The counter is shared by every test file, and vitest runs the files in
parallel, so a test can only assert that the counter grows, not its value.

## Running tests

- `pnpm start` or `pnpm test` _(both now identical)_ will:
  1. start a local `icp` network
  2. deploy the `hello_actor` canister
  3. run tests using canister IDs resolved via `ic_env` (vite-plugin path)
  4. execute `vitest run` against `src/test`
  5. stop the replica

The `test` script used to invoke `vitest` directly which caused a confusing
`CANISTER_ID_HELLO_ACTOR is missing` error when the `.env` file wasn't
present. The package has been updated so `pnpm test` now wraps the full setup
sequence; you can still run `vitest` manually if you prefer, but make sure you
have deployed and/or sourced the `.env` yourself.

## Troubleshooting

- If you ever see an error about `CANISTER_ID_HELLO_ACTOR` not being set,
  ensure `icp network start` and `icp deploy hello_actor` have completed before
  running tests. The test setup seeds the `ic_env` cookie from `icp` CLI.
