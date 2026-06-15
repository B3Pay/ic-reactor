# Next.js App Router Demo

This example demonstrates a hydration-safe IC Reactor setup in a Next.js 14 App
Router application.

It keeps browser-only IC Reactor state inside client providers, then shares one
`ClientManager` between authentication and a dynamic ledger reactor. The token
explorer queries live mainnet ICRC ledgers such as ICP, ckBTC, ckETH, ckUSDT,
and ckUSDC.

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
