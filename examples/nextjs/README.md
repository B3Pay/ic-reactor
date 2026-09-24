# Next.js Pages Router Example

This example is a legacy Next.js Pages Router app backed by a local Motoko todo
canister and manually generated `dfx` declarations. It shows how to use
`@ic-reactor/react` in an existing Next project without the Vite plugin.

## What It Uses

- Next.js Pages Router under `src/pages`
- a local Motoko todo canister under `backend/`
- `dfx` for local replica, deployment, and declaration generation
- `createReactorProvider` around a `defineReactor` over the generated
  declarations: the `QueryClient`, `ClientManager`, `AuthenticationManager` and
  todo reactor are built per render tree, so a server render never shares a
  cache or an identity with another request
- `useTodo()` for typed hooks in components (`useActorQuery`,
  `useActorMutation`, `useAuth`)

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

`defineReactor` builds the `AuthenticationManager` behind `useAuth()` on its
first use. There is no per-example `identityProvider` override. For local login, use the
package default local Internet Identity provider for the configured local IC
host.

## Key Files

- `src/service/provider.tsx` exports `ICReactorProvider` and `useTodo` from
  `createReactorProvider`, whose factory builds the todo reactor per render tree
- `src/pages/_app.tsx` wraps the app in `ICReactorProvider`
- `src/pages/index.tsx` renders the app
- `src/declarations/todo/` contains the `dfx generate` output used by the app
