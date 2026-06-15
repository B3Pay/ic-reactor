# Multiple Canister Example

This Vite example shows one React app talking to two mainnet canisters with a
shared IC Reactor client:

- ICP Ledger (`ryjl3-tyaaa-aaaaa-aaaba-cai`)
- ICDV Token (`agtsn-xyaaa-aaaag-ak3kq-cai`)

It uses `defineReactor` for one-call setup, reuses the first reactor's
`ClientManager` for the second canister, and creates auth hooks from
`AuthenticationManager({ clientManager })`.

Because both canisters are mainnet canisters, this example explicitly points the
shared agent at `https://ic0.app` and does not use `@ic-reactor/vite-plugin` or
local `ic_env` injection.

## Run

```bash
pnpm install
pnpm dev
```

The dev server uses Vite on port `3000` by default.

## Build

```bash
pnpm run build
```
