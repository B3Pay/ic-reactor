# ICP wallet on ic-reactor 4

A React and Vite wallet on a local icp-cli network: the NNS ICP ledger, a
Rust `backend` canister of its own (a profile and an address book per
caller), and Internet Identity. One client per tab,
`createClient({ network: "env", auth })`, and TanStack Query's own hooks with
the options the client builds. Every scenario below is a small file whose
header names the rule it shows, and each has tests.

## Scenarios

| #   | Scenario                                                                                                                                                                                                                   | Files                                                                                  | See it                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | `network: "env"`; the backend as `{ name: "backend" }` from the `ic_env` cookie the Vite plugin sets (with its `/api` proxy), the ledger by `{ id }`                                                                       | `src/client.ts`, `src/use-canisters.ts`, `src/EnvironmentPanel.tsx`                    | "Network and canisters": the origin, the id the client resolved, the cookie                            |
| 2   | Internet Identity through `@icp-sdk/auth` 10's `AuthClient`, built from the network the client hands its `auth` factory: the local II on a local page                                                                      | `src/client.ts`                                                                        | "Sign in with Internet Identity": a window on the local II, which asks for a seed index, not a passkey |
| 3   | A sign-in of the app's own as an `AuthLike` (dev account, local only) beside II behind one `auth`; a switch shows the next account nothing of the last                                                                     | `src/auth/dev-accounts.ts`, `src/auth/wallet-auth.ts`, `src/SignIn.tsx`, `src/App.tsx` | "Sign in with a dev account", "New dev account", then switch back and forth                            |
| 4   | Balance with `skipToken` while signed out and `refetchInterval` spread onto the client's options                                                                                                                           | `src/Balance.tsx`                                                                      | `pnpm faucet <principal>` in a terminal: the balance changes within 3 s                                |
| 5   | Send ICP: `parseUnits` input, the fee, a `memo` per transfer and `created_at_time`, typed `canister_err`, and `mayHaveExecuted` (outcome unknown, the client's re-read, "send the same transfer again" to its sender only) | `src/SendIcp.tsx`, `src/transfer.ts`                                                   | Send; type `1e3` (refused before sending); send more than you hold (`InsufficientFunds`)               |
| 6   | Profile reads and writes as the caller; a write while signed out is refused `unauthenticated`                                                                                                                              | `src/Profile.tsx`                                                                      | Save a name; save a long one (the backend's `Err`); sign out and save                                  |
| 7   | Optimistic add and remove that keep the client's `onMutate` and `onSettled`, rolled back on `canister_err` or a failure                                                                                                    | `src/optimistic-contacts.ts`, `src/AddressBook.tsx`                                    | Add a contact; add the same name in another case (`DuplicateName`: shown, then rolled back)            |
| 8   | Paying a contact: which reads the write changes (the ledger's, not the backend's)                                                                                                                                          | `src/SendToContact.tsx`                                                                | "Pay": your balance and the contact's both change                                                      |
| 9   | A production build of the same code                                                                                                                                                                                        | `vite.config.ts`                                                                       | `pnpm build && pnpm preview`, http://localhost:5185                                                    |

The unknown outcome of scenario 5 and the trap of scenario 7 need a fault a
local network does not make on demand: the tests inject them.

## Run it

You need Node 22.18 or later, and for the backend the Rust toolchain with the
`wasm32-unknown-unknown` target and `ic-wasm` on your PATH (what icp-cli's
Rust recipe calls). icp-cli 1.2.0 itself is a devDependency of this example.
From the repository root, `pnpm install` and `pnpm build`, then:

```sh
cd examples/vite-wallet
pnpm icp:start                   # local network on port 8000, with II and the NNS
pnpm icp:deploy                  # builds and deploys the backend
pnpm faucet <principal> [amount] # sends local ICP (10 by default) to a principal
pnpm dev                         # http://localhost:5175
pnpm icp:stop                    # when you are done
```

Open http://localhost:5175, sign in with a dev account, and copy the
`pnpm faucet ...` line the Balance panel shows into a terminal. The faucet
sends from icp-cli's anonymous identity, which every local network funds.
Dev accounts live in the tab's sessionStorage: a reload keeps them, a new tab
starts with none. The balance is read again every 3 s while the tab is
visible (TanStack Query pauses `refetchInterval` in a hidden tab, and reads
again when it is shown).

"Sign in with Internet Identity" opens the local II in a new window. It is a
test build that makes no passkey: choose Create, then "Create with passkey",
name the identity, and answer its "Enter seed index" prompt with a number.
Continue returns you to the wallet, signed in, and the session survives a
reload. Next time, Continue as the identity it remembers and give the same
number: the principal is the same.

## Test it

```sh
pnpm test       # every scenario, on createTestClient(): no replica, no network
pnpm typecheck
pnpm build
pnpm gen:check  # fails if src/canisters/ is stale
```

The tests run a real client over the in-memory replica of
`@ic-reactor/core/testing`, with the ledger and the backend mocked per caller
(`src/test/test-wallet.tsx`), in jsdom, whose page carries an `ic_env` cookie
like the plugin's. `src/canisters/` is generated from `backend/backend.did`
and `ledger.did` by `@ic-reactor/vite-plugin` on every `vite dev` and
`vite build` (`pnpm gen` runs `candid-core-cli gen` by hand), committed, and
never edited.

## The env network in production

`vite build` writes static files, and the code does not change for a deployed
page: with `network: "env"` it calls its own origin's `/api`, which an asset
canister's domain (`<id>.icp0.io`) serves as the dev server's proxy does
locally. What changes is the cookie. An asset canister sets an `ic_env`
cookie too, but ic-reactor reads it only where both the page and the replica
are local, because any sibling subdomain of a page's domain can write a
cookie. On a deployed page `{ name: "backend" }` stays unresolved and its
calls are refused before sending (`invalid_args`, code
`canister_id_unresolved`). Give the deployed build the id instead, as
`{ id: import.meta.env.VITE_BACKEND_ID }`, or pass `allowEnvConfig: true` to
`createClient` if every subdomain of the page's domain is yours. The root key
there is mainnet's, built into the agent; nothing is fetched. Internet
Identity is mainnet's (the `AuthClient` defaults), and the dev account is not
offered.
