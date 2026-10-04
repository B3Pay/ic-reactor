# End-to-End Test Workspace

The real-replica suite of ic-reactor 4: a small Rust canister, `hello_actor`,
deployed to a local icp-cli 1.2.0 network, and twelve vitest cases that call
it through the published API of `@ic-reactor/core`, `@ic-reactor/react` and
`@ic-reactor/vite-plugin`, with the module `candid-core-cli gen` writes from
its `.did`.

## Running it

From the repository root, once:

```bash
pnpm install   # installs icp-cli 1.2.0 and ic-wasm 0.11.1 into e2e/node_modules
pnpm build     # the suite imports the built packages
```

Rust with the `wasm32-unknown-unknown` target builds the canister.

Then `pnpm test` in `e2e/` (or `pnpm test-e2e` at the root, or
`bash e2e/test.sh`):

1. checks that `icp` is the pinned 1.2.0 (`node_modules/.bin` comes first on
   PATH; a global install of the same version works too, which is what CI
   has), and that `src/declarations` matches the `.did` (`pnpm gen:check`);
2. starts a local network (`icp network start -d`, port 8000) and deploys
   `hello_actor`;
3. calls `greet` once with `icp` to check the deployment;
4. runs `vitest run`;
5. stops the network, also when a step fails.

To iterate on the cases, keep a network up yourself:

```bash
pnpm icp:start && pnpm icp:deploy
pnpm test:vitest            # or: pnpm exec vitest run src/errors.test.ts
pnpm icp:stop
```

`global-setup.ts` asks `icp` for the network's URL and root key and the
canister's id, and fails the run when there is none. A run that finds no test
file fails too: there is no `passWithNoTests`.

## The canister

`src/actor/src/lib.rs`; each method puts one kind of value or failure on the
wire.

| Method          | Signature                                       | Covers                                                                                 |
| --------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| `greet`         | `(text) -> (text) query`                        | A query.                                                                               |
| `is_replicated` | `() -> (bool) query`                            | How a query went out: `false` as a query, `true` as an update call (a certified read). |
| `increment`     | `() -> (nat)`                                   | A stateful update.                                                                     |
| `count`         | `() -> (nat) query`                             | Reads what the updates wrote.                                                          |
| `increment_by`  | `(nat64) -> (variant { Ok : nat; Err : text })` | Both arms of a Result from an update. Zero returns `Err` and changes nothing.          |
| `refuse`        | `() -> ()`                                      | `ic0.msg_reject`: reject code 4.                                                       |
| `boom`          | `() -> ()`                                      | A trap: reject code 5.                                                                 |
| `whoami`        | `() -> (principal) query`                       | The caller, for the identity switch.                                                   |

`src/actor/hello_actor.did` is written by hand, so change it together with
`lib.rs`; the build embeds it as the canister's `candid:service` metadata.
`src/declarations/hello_actor.ts` (and its Contract envelope) is what
`candid-core-cli gen` writes from it: run `pnpm gen` after a change to the
`.did`, and commit both. Prettier leaves them alone.

## The cases

The files run one at a time (`fileParallelism: false`): they share the
canister's counter, and the anonymous-write case reads it back. Each runs in
jsdom, where `auth` sign-in, the `ic_env` cookie and `ReactorProvider` exist;
the agent sends with Node's `fetch`.

| File               | Case                                                                                                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `calls.test.ts`    | A query (direct and through `queryOptions`, sent as a query); an update through `mutationOptions`, which invalidates the canister's reads; a certified read (`{ id, certified: true }`); the root key fetched from the local replica.                                                                   |
| `errors.test.ts`   | A reject 4 and a trap (reject 5), both `rejected` and may have executed; a Result `Err` as `canister_err`, which did not leave the outcome open; an anonymous write refused before sending (`unauthenticated`, `anonymous_write`); an unresolved `{ name }` (`invalid_args`, `canister_id_unresolved`). |
| `identity.test.ts` | A switch between two Ed25519 identities on one client: the caller the canister sees, `client.caller()` and the query keys all follow it.                                                                                                                                                                |
| `vite-env.test.ts` | A Vite dev server with `@ic-reactor/vite-plugin`, started in the test: the page load's `ic_env` cookie resolves `{ name: "hello_actor" }`, and the call goes through the server's `/api` proxy.                                                                                                         |
| `react.test.tsx`   | `ReactorProvider`, `useClient` and `useQuery`: the component renders what the canister answers, as whoever is signed in, and again after a switch.                                                                                                                                                      |
