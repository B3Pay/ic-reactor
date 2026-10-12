# Canister Studio on ic-reactor 4

A TanStack Start app (server-rendered, React 19) that gives every method of
any canister on mainnet a form built from its Candid, and calls it with every
rule of ic-reactor 4 in view. Four canisters are typed at build time: the ICP
ledger (`src/canisters/icp_ledger.ts`), the ckBTC and ckETH ledgers
(`src/canisters/icrc1.ts`, which serves any ICRC-1 ledger) and the ckBTC
minter (`src/canisters/ckbtc_minter.ts`). Any other canister's interface is
read live from its certified `candid:service` metadata, compiled on the
server by `@candid-core/cli` and rebuilt in the browser with
`schemaFromContract`. The forms, the calls and the replies are the same for
both.

## Scenarios

| #   | Scenario                                                                                                                                                                                                                     | Files                                                                                                                     | How to see it                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Automatic forms for the typed canisters: a field per Candid type (amounts in token units, principals checked as you type, `created_at_time` set to now), required fields first, and a submit button that names what is wrong | `src/forms/engine.ts`, `src/forms/hints.ts`, `src/forms/MethodForm.tsx`, `src/forms/TypedForm.tsx`, `src/lib/registry.ts` | `/canister/ryjl3-tyaaa-aaaaa-aaaba-cai`: pick any of the ICP ledger's methods; `/wallet`: Send is the typed form of `icrc1_transfer`                            |
| 2   | Any mainnet canister from its certified metadata: `candid:service` and `module_hash` in one certified `read_state`, compiled on the server, cached by module hash; the uncertified fallback is labelled                      | `src/interface/live-candid.server.ts`, `src/interface/functions.ts`, `src/interface/load.ts`                              | `/canister/rrkah-fqaaa-aaaaa-aaaaq-cai` (NNS governance: "Certified metadata"); `/canister/lj532-6iaaa-aaaah-qcc7a-cai` (no metadata: "UNCERTIFIED")            |
| 3   | SSR with hydrated mainnet reads: one client per request and one per tab, loaders that prefetch and never throw, no refetch on hydration, and no failed read sent to the browser                                              | `src/router.tsx`, `src/lib/reactor.ts`, `src/routes/index.tsx`                                                            | `/` with the network panel open: the ledgers' supply and fee are in the HTML, and nothing is read again on load                                                 |
| 4   | Shared query links rendered on the server: the loader decodes the link's hex Candid arguments and prefetches with the options the runner uses, so the result is in the HTML                                                  | `src/calls/share.ts`, `src/calls/query-options.ts`, `src/routes/canister.$canisterId.index.tsx`                           | run a query, copy its share link, and open it with JavaScript off; `/canister/ryjl3-tyaaa-aaaaa-aaaba-cai?method=icrc1_total_supply&args=4449444c0000&run=true` |
| 5   | Safe writes: signed out, a write is disabled and says why; signed in, a confirm step shows the sender, the target, the method, the Candid text and the size and sha256 of the exact argument bytes; sent once, never retried | `src/calls/WriteRunner.tsx`, `src/calls/ConfirmWrite.tsx`, `src/values/CallPreview.tsx`                                   | sign in, open a ledger's `icrc1_transfer`, press Review: the confirm step (Cancel sends nothing)                                                                |
| 6   | Unknown outcomes and `resendOf`: `mayHaveExecuted` read on every failed write; a re-send only through `client.resendOf`, deduplicated by `created_at_time`, or else "read the state back first"                              | `src/calls/WriteRunner.tsx`, `src/calls/ResendPanel.tsx`, `src/calls/ErrorPanel.tsx`                                      | `/safety`, scenario 3: a lost reply, then its re-send answered `Duplicate` (mainnet loses no reply on demand)                                                   |
| 7   | Certified reads: the Certified switch reads through `{ id, certified: true }`, under a key of its own; a composite query has no certified path, and says so                                                                  | `src/calls/useCanisterHandle.ts`, `src/calls/ReadRunner.tsx`                                                              | any query, then Certified: the key shown gains its certified segment; `/canister/2jvtu-yqaaa-aaaaq-aaama-cai` for a composite query                             |
| 8   | Idempotent update reads: the ckBTC minter's `get_btc_address`, an update, read once per caller through `{ update: "idempotent" }`                                                                                            | `src/lib/registry.ts`, `src/calls/query-options.ts`, `src/components/wallet/MinterPanel.tsx`                              | `/wallet`, ckBTC, signed in: the deposit address, asked once and kept                                                                                           |
| 9   | Caller-scoped cache keys: the live query key shown with its caller segment; a sign-in or a sign-out moves every read to new keys, so nothing read as one caller is shown to another                                          | `src/calls/CacheKeyPanel.tsx`, `src/components/wallet/BalancePanel.tsx`                                                   | `/wallet`: the balance's key; sign in, then out                                                                                                                 |
| 10  | The Safety lab: ten scenarios that `createTestClient()` runs in the browser against a mocked ICRC-1 ledger, each with its code, its request log, the `ReactorError` fields and the verdict                                   | `src/safety/scenarios.ts`, `src/safety/mock-ledger.ts`, `src/safety/SafetyLab.tsx`                                        | `/safety`: run each card; nothing reaches the network                                                                                                           |
| 11  | The playground: a pasted `.did` compiled in the browser by the lazily loaded WASM of `@candid-core/cli`, forms for its methods and calls to a target canister, its TypeScript module, a projection and a compatibility check | `src/interface/browser.ts`, `src/routes/playground.tsx`, `src/components/playground/`                                     | `/playground`: the sample compiles; give it a target canister id                                                                                                |
| 12  | Interface tools: the Candid text (copy, download), the TypeScript module (`didToModule`), a projection to chosen methods (`projectDid`), and a written `.did` checked against the live one (`checkCompatible`)               | `src/routes/canister.$canisterId.interface.tsx`, `src/interface/functions.ts`, `src/interface/browser.ts`                 | `/canister/mqygn-kiaaa-aaaar-qaadq-cai/interface`                                                                                                               |

`/history` lists the calls made in this browser, each with its arguments as
the hex of their encoded bytes (never JSON) and a link that replays it
(`src/calls/history.ts`, `src/routes/history.tsx`).

Writes are real mainnet calls. Sign-in is mainnet's Internet Identity, and a
transfer you confirm moves real tokens from your account.

## How a live interface is loaded

The server function `fetchInterface` (`src/interface/functions.ts`, whose
server-only code is in `src/interface/live-candid.server.ts`) takes a canister
id and nothing else: no server route accepts `.did` text. It:

- refuses text that is not a canister id, and the management canister
  `aaaaa-aa`, before any request;
- reads `candid:service` and `module_hash` from the IC API host in one
  certified `read_state`, with the agent's retries off. A 403 means the
  interface is private;
- falls back to the `__get_candid_interface_tmp_hack` query only when the
  metadata is absent, and labels that interface UNCERTIFIED. It never falls
  back after a certificate fails to verify;
- refuses a `.did` over 256 KiB, and bounds the whole load with a timeout;
- compiles with `@candid-core/cli` (`CANDID_CORE_WASM` points it at another
  copy of its WASM) and caches: canister to module hash and `.did` hash for
  60 s, then re-checks the module hash alone; `.did` hash to the compiled
  envelope in an LRU of 200 entries. Loads in flight are shared, and a canister is
  compiled again only when its module hash changes. A failure that will not
  change soon (no interface, a private one, a compile error) is cached for 5
  minutes, a network failure or timeout for 15 s.

The browser gets the envelope's JSON and rebuilds the actor with
`schemaFromContract`. The compiler's 1.9 MB WASM is loaded in the browser only
on demand: by the playground, by the check of a pasted `.did` (a typed
canister's committed `.did` is checked on the server), and by the StackBlitz
fallback below.

## Run it

```sh
corepack pnpm install && corepack pnpm build  # once, at the repository root: the workspace packages
corepack pnpm --filter canister-studio dev    # http://localhost:3410
```

A production build:

```sh
cd examples/canister-studio
corepack pnpm build    # tsc --noEmit, then vite build into dist/client and dist/server
corepack pnpm preview  # Start's server over dist/: http://localhost:4173
```

The app uses no Nitro: `vite preview` runs Start's server bundle, which
imports its dependencies from `node_modules`.

StackBlitz runs `npm run dev`. `/` renders there on the server with its
mainnet reads, because its loader calls no server function. Server functions
do not run there: TanStack Start keeps each request in Node's
`AsyncLocalStorage`, which StackBlitz's WebContainer does not implement. The
typed canisters need none. For any other canister, opened from inside the app
(or with Try again on a page loaded directly, whose server render reports the
failure), the browser reads the certified metadata itself and compiles it with
the lazily loaded WASM.

## Test it

```sh
corepack pnpm --filter canister-studio test       # vitest; no test reaches mainnet
corepack pnpm --filter canister-studio typecheck
corepack pnpm --filter canister-studio gen:check  # fails if src/canisters/ is stale
corepack pnpm --filter canister-studio smoke      # mainnet, never part of test; Node 22.18+
```

The tests run in jsdom over the committed generated modules. Every client in
them is a `createTestClient()` from `@ic-reactor/core/testing`, over an
in-memory replica that mocks each canister at its mainnet id, and the live
interface loader takes an injected fetcher, so nothing reaches the network:

- `src/lib/` and `src/router.test.ts`: ids, formatting, hex, the registry,
  the client, and which reads the server sends to the browser.
- `src/forms/`: every method of the three envelopes gets defaults that encode,
  or is marked uninhabited; drafts and values round-trip; issue paths land on
  their fields; keys such as `__proto__`; recursive types; units; a transfer
  filled in and submitted as the exact value.
- `src/values/`: Candid text, `Ok` replies unwrapped, vectors of records as
  tables.
- `src/calls/`: an anonymous write refused with no request sent; an unknown
  outcome, its `resendOf` and the `Duplicate`; `canister_err` and
  `invalid_args` shown; the query key carries the caller; history stores hex.
- `src/interface/`: bad ids, the management canister, a 403, the size cap,
  the uncertified fallback, a cache hit by module hash, compile diagnostics,
  method docs.
- `src/safety/`: the verdict of each Safety lab scenario, run headless.
- `src/components/`: the shared-link search params and decoding, the wallet's
  ledgers, and the UI primitives.

`src/canisters/` is generated from `did/icrc1.did`, `did/icp_ledger.did` and
`did/ckbtc_minter.did` by `@ic-reactor/vite-plugin` on every `vite dev` and
`vite build` (the `gen` script runs `candid-core-cli gen` by hand), committed,
and never edited. `did/icrc1.did` is the ICRC-1 interface that
`examples/icrc-ledger` uses. `did/icp_ledger.did` and `did/ckbtc_minter.did`
are the full interfaces the two canisters publish in their certified
`candid:service` metadata, so the typed pages show every method. The `smoke`
script checks each committed `.did` against its live canister, reads the
ledgers and the minter, and checks that an anonymous transfer is refused.
`src/routeTree.gen.ts` is generated by the router plugin and committed too,
because `tsc` runs before any build.

## The rules it keeps

The app keeps each of these rules, which come from `@ic-reactor/core`'s
`llms.txt`:

1. Principals come from `principal(text)` or are checked by `isPrincipal`,
   never cast.
2. A `bigint` is never made a `number`; token amounts go through `parseUnits`
   and `formatUnits`.
3. A write is never retried, and `useQuery` runs no update but the idempotent
   opt-in.
4. Query keys come from the client, never by hand; no `keepPreviousData`, and
   no `initialData` from another key.
5. One client per request on the server and one per tab, made by
   `getRouter()`.
6. `mayHaveExecuted` is read on every failed write, and a re-send goes only
   through `resendOf`.
7. Names and strings from a canister are rendered as text, never as HTML.
8. The server function fetches only from the IC API host, checks the id, caps
   the `.did`, and bounds its compile time and its caches.
9. An uncertified interface is labelled, and a failed certificate is never
   followed by a fallback.
10. A write shows its sender, target, method and exact bytes before it is
    sent.
