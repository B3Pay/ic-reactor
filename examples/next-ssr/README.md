# Next.js SSR on ic-reactor 4

A Next.js App Router app (Next 16, React 19) that reads three mainnet ICRC-1
ledgers (ICP, ckBTC and ckETH) on the server with `@ic-reactor/core`, hands
its cache to the browser, and reads again in the browser as whoever signs in
with Internet Identity there. One generated module,
`src/canisters/icrc1.ts`, serves every ledger.

## Scenarios

Each scenario lives in its own small file, whose header comment names the
rule it shows. Every one is tested (`pnpm test`), and every one shows on a
running server.

| #   | Scenario                                                                    | Files                                                                                | How to see it                                                                         |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 1   | One client per request on the server; prefetch by `{ id }`; `dehydrate`     | `src/server/request-client.ts`, `src/server/prefetch-ledgers.ts`, `src/app/page.tsx` | `/`: each card says when the server read it                                           |
| 2   | `ReactorProvider` factory in a `'use client'` module; nothing refetched     | `src/app/providers.tsx`, `src/components/server-data.ts`                             | `/` with the network panel open: no request to `icp-api.io` until you ask for one     |
| 3   | Lossless hydration of `bigint`, principals and `Uint8Array`                 | `src/components/LedgerCard.tsx`                                                      | the run-time type after each value; mainnet returns no blob here, the tests' mocks do |
| 4   | Renders with JavaScript disabled                                            | `scripts/smoke.ts`                                                                   | turn JavaScript off and reload `/`                                                    |
| 5   | Streaming with Suspense: certified balances arrive after the page           | `src/app/account/CertifiedBalances.tsx`                                              | `/account?owner=rkp4c-7iaaa-aaaaa-aaaca-cai`                                          |
| 6   | Progressive enhancement: a GET form, validated on the server                | `src/app/account/page.tsx`, `src/server/parse-owner.ts`                              | look up with JavaScript on and off; `/account?owner=not-a-principal`                  |
| 7   | Route Handler: a client per request, amounts as text, kind as HTTP status   | `src/app/api/balance/[ledger]/[principal]/route.ts`, `src/server/balance-route.ts`   | `/api/balance/ckBTC/rkp4c-7iaaa-aaaaa-aaaca-cai`; a bad principal is a 400            |
| 8   | Errors on the server: one section fails with its `kind`, not the page       | `src/components/LedgerError.tsx`, `src/server/error-summary.ts`                      | `/`: the "NNS governance (not a ledger)" section                                      |
| 9   | Sign in after hydration: the new caller's keys, nothing anonymous reused    | `src/components/MyBalances.tsx`, `src/components/LedgerCard.tsx`                     | sign in with Internet Identity: "My balances" loads, each card reads again as you     |
| 10  | A reload while signed in: hydrated from the server's data, then read as you | `src/app/providers.tsx`, `src/components/LedgerCard.tsx`                             | sign in, then reload `/`: no hydration error, then each card reads again as you       |

## Run it

```sh
pnpm install && pnpm build   # once, at the repository root: the workspace packages
cd examples/next-ssr
pnpm dev                     # http://localhost:3001
pnpm build && pnpm start     # http://localhost:3011
pnpm smoke                   # checks the running start server against mainnet; Node 22.18+
```

To see scenario 4, turn JavaScript off (Chrome DevTools: the command menu,
"Disable JavaScript") and reload `/` or `/account?owner=...`: every value is
there, and the certified section shows its fallback, which says why.

The route of scenario 7 answers a failure with a status that says whether
asking again can help. A canister id that names no canister,
`/api/balance/2y4s5-zaaaa-aaad7-7777q-cai/rkp4c-7iaaa-aaaaa-aaaca-cai`, is a
502 with `kind: "not_delivered"` and `httpStatus: 400`: the IC refused it for
good. A rate limit or a 5xx from the IC is a 503.

The pages read mainnet when a request comes in, never during `next build`
(`/` calls `connection()`; `/account` and the route read their parameters), so
a build needs no network.

## Test it

```sh
pnpm test        # vitest; no test reaches mainnet
pnpm typecheck
pnpm gen:check   # fails if src/canisters/ is stale
```

The tests run the real client on `createTestClient()` from
`@ic-reactor/core/testing`, over in-memory replicas that mock the ledgers at
their mainnet ids (`src/testing/mock-ledgers.ts`). A test builds one client
for the server's request, one for the server render of the client components
and one for the browser tab, as the app has, and reads each replica's request
log to tell which side sent what:

- `src/server/*.test.ts`: the prefetch, its JSON round trip, the account
  reads, the owner parameter and the route handler.
- `src/server/request-client.rsc.test.tsx`: `/account` rendered by React's
  Flight server with the `react-server` condition, as Next renders Server
  Components, so React's `cache()` memoizes as in a request: one client
  serves the page and its streamed section, and the next request gets a new
  one. It runs in vitest's `react-server` project (`vitest.config.ts`).
- `src/components/hydration.test.tsx`: the home page rendered to HTML, read
  with no script run, hydrated without a mismatch or a request, then signed
  in; and hydrated in a tab that is still signed in, without a mismatch, then
  read as the user.
- `src/components/MyBalances.test.tsx`: sign-in, a switch of account,
  sign-out, and a ledger whose decimals or symbol read fails.
- `src/components/LedgerCard.test.tsx`: a card whose reads fail in the tab.
- `src/app/providers*.test.tsx`: the real `<Providers>` on a server and in a
  browser.
- `src/app/account/account.test.tsx`: `/account` streamed by React's server
  renderer, the certified section held until the first part is read.

`src/canisters/` is generated from `icrc1.did` by `pnpm gen`
(`candid-core-cli gen`), committed, and never edited.

## A tab that is still signed in

Query keys carry the caller, and an `AuthClient` reads a stored session
synchronously, so a tab that is still signed in from an earlier visit knows
the user before its first render, while the server prefetched as the
anonymous principal. The keys `useClient()` builds follow the caller React
renders with, the one `useAuth()` returns: anonymous on the server and while
the page hydrates. So the hydrating render finds the server's data under the
anonymous keys, matches the server's HTML and sends nothing; then React
renders each component that calls `useClient()` or `useAuth()` again with the
session, and every card reads its own keys once, as the user (scenario 10).
`src/components/hydration.test.tsx` checks it: no recoverable error, no
console error, the server's nodes kept, no anonymous read sent, and each card
read once as the user.

That move has one cost, which this app does not pay: a Suspense boundary that
has not hydrated yet (its streamed HTML, or its lazy code, still on the way)
below a component that calls `useClient()` or `useAuth()` is rendered on the
client when that component moves on, showing its fallback instead of the
server's HTML. The streamed section of `/account` sits in a Server Component,
and no client component above it renders with the caller, so it streams in as
the server sent it. In your own app, keep such a boundary out from under a
component that renders with the caller, or pass it in as `children`.
