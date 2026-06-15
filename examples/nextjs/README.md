# Next.js Pages Router Example

This example is a legacy Next.js Pages Router app backed by a local Motoko todo
canister and manually generated `dfx` declarations. It shows how to use
`@ic-reactor/react` in an existing Next project without the Vite plugin.

## What It Uses

- Next.js Pages Router under `src/pages`
- a local Motoko todo canister under `backend/`
- `dfx` for local replica, deployment, and declaration generation
- `ClientManager({ queryClient, agentOptions })` shared by auth and the todo
  reactor
- `createActorHooks` over a `Reactor` built from generated declarations

## Run

```bash
pnpm install
pnpm dfx:start
pnpm deploy
pnpm generate
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

The client points at `http://127.0.0.1:4943` by default. Override it with
`NEXT_PUBLIC_IC_HOST` if your local replica uses a different gateway.

## Auth

The app creates auth hooks with `AuthenticationManager({ clientManager })`.
There is no per-example `identityProvider` override. For local login, use the
package default local Internet Identity provider for the configured local IC
host.

## Key Files

- `src/service/client.ts` creates the shared `ClientManager` and auth hooks
- `src/service/todo.ts` creates the `Reactor` and bound hooks from generated
  declarations
- `src/pages/index.tsx` renders the app
- `src/declarations/todo/` contains the `dfx generate` output used by the app
