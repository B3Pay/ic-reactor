# Next.js App Router Demo

This example demonstrates a hydration-safe IC Reactor setup in a Next.js 14 App
Router application.

It keeps browser-only IC Reactor state inside client providers, then shares one
`ClientManager` between authentication and a ledger reactor. The token explorer
queries live mainnet ICRC ledgers such as ICP, ckBTC, ckETH, ckUSDT, and
ckUSDC: `src/app/ledger-provider.tsx` builds one reactor for the ICRC interface
and hands out hooks for `ledger.forCanister(selectedToken)`, so each token has
its own reactor and cache entries. The balance query waits for a valid account
with `skipToken`.

`src/app/LedgerSnapshot.tsx` is a server component. It imports `ClientManager`
and `Reactor` from `@ic-reactor/react` like the client code does; Next.js
resolves that import through the package's `react-server` export condition,
which carries the core classes and none of the hooks. It builds both inside the
request, reads the ICP ledger's total supply, and streams the result in behind
a `Suspense` boundary.

Because the demo targets mainnet canisters, the shared agent is explicitly
configured with `https://ic0.app`. It does not use local `ic_env` injection or a
manual local Internet Identity canister.

## Run

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```bash
pnpm run build
```
