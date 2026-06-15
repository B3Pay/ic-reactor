# Custom Provider Example

This Vite example demonstrates a custom React provider around IC Reactor hooks
for dynamic ICRC1 canister IDs.

The app uses package-level defaults for auth and local development:

- `ClientManager({ queryClient })` auto-detects browser `ic_env` when present.
- `AuthenticationManager({ clientManager })` chooses the Internet Identity
  provider from `ic_env` when running against local ICP CLI.
- `@ic-reactor/vite-plugin` runs in env-only mode with
  `icReactor({ canisters: [] })`, so the app can receive the built-in local
  Internet Identity provider without generating canister code.

## Run

```bash
pnpm install
pnpm dev
```

The dev server uses Vite on port `3000` by default.

For local Internet Identity with ICP CLI, start the local network first:

```bash
icp network start
```

The Vite plugin injects the local provider into the `ic_env` cookie:

```text
INTERNET_IDENTITY_PROVIDER=http://id.ai.localhost:8000/authorize
```

No per-example `identityProvider` or `withCanisterEnv: true` setting is needed.

## Build

```bash
pnpm run build
```
