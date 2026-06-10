# IC Reactor Core + TypeScript Demo

This example shows how to use `@ic-reactor/core` and `@ic-reactor/auth` from a
vanilla TypeScript/Vite app, without React.

The app talks to mainnet ICRC token canisters, starting with the ICP ledger, and
lets you switch to other known ck token canisters or enter a custom token
canister ID.

## What it demonstrates

- Creating a shared `ClientManager` and `QueryClient`
- Creating a `Reactor` directly with a Candid IDL factory
- Using `AuthenticationManager({ clientManager })` for Internet Identity login
- Calling query/update methods outside React components
- Switching a reactor between token canister IDs with `setCanisterId`

Because this demo targets mainnet ledgers, it sets the agent host to
`https://ic0.app`. It does not use the Vite plugin, a local `ic_env` cookie, or a
local Internet Identity provider.

## Run locally

```bash
pnpm install
pnpm run dev
```

Then open the Vite URL printed in the terminal.

## Build

```bash
pnpm run build
```
