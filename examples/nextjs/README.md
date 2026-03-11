# Next.js Example

This example is a Next.js Pages Router app backed by a Rust canister and a
manual `dfx` declaration workflow. It shows how to wire `@ic-reactor/react`
into a traditional Next.js project without the Vite plugin.

## What It Uses

- Next.js Pages Router under `src/pages`
- a Rust backend canister under `backend/`
- `dfx` for local replica, deployment, and declaration generation
- `ClientManager` with `withProcessEnv: true`
- `createActorHooks` over a `Reactor` built from generated declarations

## Prerequisites

- Node.js
- Rust
- `dfx`
- `cargo install candid-extractor ic-wasm` if you have not installed those
  helpers yet

## Run It

```bash
cd examples/nextjs
npm run install:all
npm run dfx:start
npm run deploy
npm run generate
npm run dev
```

Open http://localhost:3000 when the app is ready.

## Key Files

- `src/service/client.ts` creates the shared `ClientManager` and auth hooks
- `src/service/todo.ts` creates the `Reactor` and bound hooks from generated
  declarations
- `src/pages/index.tsx` renders the app
- `src/declarations/todo/` contains the `dfx generate` output used by the app

## Why This Example Exists

Most current IC Reactor examples use Vite plus generated hooks. This one is the
reference for teams that still have:

- an existing Next.js project
- `dfx`-generated declarations
- manual build or deployment scripts

If you want zero-command regeneration during development, use the Vite examples
instead.
