# ICP wallet on ic-reactor 4

A React and Vite wallet on a local icp-cli network: the NNS ICP ledger, a
Rust `backend` canister of its own (a profile and an address book per
caller), and Internet Identity. One client per tab,
`createClient({ network: "env", auth })`, and TanStack Query's own hooks with
the options the client builds. Every scenario below is a small file whose
header names the rule it shows, and each has tests.

## Scenarios

| #   | Scenario                                                                                                                                                                                                                                                 | Files                                                                                  | See it                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | `network: "env"`; the backend as `{ name: "backend" }` from the `ic_env` cookie the Vite plugin sets (with its `/api` proxy), the ledger by `{ id }`                                                                                                     | `src/client.ts`, `src/use-canisters.ts`, `src/EnvironmentPanel.tsx`                    | "Network and canisters": the origin, the id the client resolved, the cookie                            |
| 2   | Internet Identity through `@icp-sdk/auth` 10's `AuthClient`, built from the network the client hands its `auth` factory: the local II on a local page                                                                                                    | `src/client.ts`                                                                        | "Sign in with Internet Identity": a window on the local II, which asks for a seed index, not a passkey |
| 3   | A sign-in of the app's own as an `AuthLike` (dev account, local only) beside II behind one `auth`; a switch shows the next account nothing of the last                                                                                                   | `src/auth/dev-accounts.ts`, `src/auth/wallet-auth.ts`, `src/SignIn.tsx`, `src/App.tsx` | "Sign in with a dev account", "New dev account", then switch back and forth                            |
| 4   | Balance with `skipToken` while signed out and `refetchInterval` spread onto the client's options                                                                                                                                                         | `src/Balance.tsx`                                                                      | `pnpm faucet <principal>` in a terminal: the balance changes within 3 s                                |
| 5   | Send ICP: `parseUnits` input, the fee, a `memo` per transfer and `created_at_time`, typed `canister_err`, and `mayHaveExecuted` (outcome unknown, the client's re-read, "send the same transfer again", offered by `client.resendOf` to its sender only) | `src/SendIcp.tsx`, `src/transfer.ts`                                                   | Send; type `1e3` (refused before sending); send more than you hold (`InsufficientFunds`)               |
| 6   | Profile reads and writes as the caller; a write while signed out is refused `unauthenticated`                                                                                                                                                            | `src/Profile.tsx`                                                                      | Save a name; save a long one (the backend's `Err`); sign out and save                                  |
| 7   | Optimistic add and remove that keep the client's `onMutate` and `onSettled`, rolled back on `canister_err` or a failure; the list is a certified read, since a contact decides where a payment goes                                                      | `src/optimistic-contacts.ts`, `src/AddressBook.tsx`, `src/use-canisters.ts`            | Add a contact; add the same name in another case (`DuplicateName`: shown, then rolled back)            |
| 8   | Paying a contact: which reads the write changes (the ledger's, not the backend's)                                                                                                                                                                        | `src/SendToContact.tsx`                                                                | "Pay": your balance and the contact's both change                                                      |
| 9   | A production build of the same code                                                                                                                                                                                                                      | `vite.config.ts`                                                                       | `pnpm build && pnpm preview`, http://localhost:5185                                                    |
| 10  | The production build on an asset canister: a Content-Security-Policy that runs the app's own files only, a `Cross-Origin-Opener-Policy` that keeps the II window, the `hardened` headers, and the raw host redirected                                    | `public/.ic-assets.json5`, `icp.yaml`                                                  | `pnpm icp:deploy`, then http://frontend.local.localhost:8000 (and `curl -sI` on it)                    |

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
pnpm icp:deploy                  # builds and deploys the backend and the app
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

`pnpm icp:deploy` also builds the app and serves it from an asset canister
at http://frontend.local.localhost:8000, with the response headers of
`public/.ic-assets.json5` (scenario 10); the docs guide "Deploy to a
frontend canister" says what each one does. Sign in there with a dev
account: the asset canister's `ic_env` cookie names no Internet Identity, so
the II button opens mainnet's, not the local one.

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
never edited. `ledger.did` is the projection of the mainnet ICP ledger's
interface to the five methods the wallet calls (the ledger entry's `methods` in
`vite.config.ts`), as the plugin wrote it from the live canister. It is
committed, so builds read it and make no request. `IC_REACTOR_FETCH=ledger`
writes it again from the canister, and `IC_REACTOR_VERIFY=ledger pnpm build`
checks it against the live ledger.

## The env network in production

`vite build` writes static files, and the code does not change for a deployed
page: with `network: "env"` it calls its own origin's `/api`, which an asset
canister's domain (`<id>.icp0.io`) serves as the dev server's proxy does
locally. What changes is the cookie. An asset canister sets an `ic_env`
cookie too. On `<id>.icp0.io`, a public suffix no other canister can set a
cookie for, ic-reactor believes its canister ids (never its root key); on
`<id>.ic0.app` and a custom domain it does not, because a sibling subdomain
can write a cookie there, so `{ name: "backend" }` stays unresolved and its
calls are refused before sending (`invalid_args`, code
`canister_id_unresolved`). For a build that works on every domain, give it
the id instead, as
`{ id: import.meta.env.VITE_BACKEND_ID }`. `allowEnvConfig: true` is safe only
on `<id>.icp0.io`, a public suffix, or a custom domain whose every subdomain is
yours; on `ic0.app` `createClient` refuses it, because any other canister's
page can set the cookie there. Even with it, the cookie's root key is not
used on mainnet. The root key
there is mainnet's, built into the agent; nothing is fetched. Internet
Identity is mainnet's (the `AuthClient` defaults), and the dev account is not
offered.
