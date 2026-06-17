# IC Reactor Start V0 Plan

## Summary

Build `@ic-reactor/start` V0 as a client-rendered, fully on-chain ICP React
starter that composes the current IC Reactor packages with TanStack Router and
`icp-cli`.

V0 should not attempt SSR, TanStack Start server functions, or colocated backend
functions. It should deliver the fastest credible path to:

```bash
pnpm create ic-reactor-start my-app
cd my-app
icp network start -d
icp deploy
pnpm dev
```

The generated app deploys static assets to an ICP asset canister, resolves
canister IDs through `icp-cli` and the `ic_env` cookie, generates typed canister
hooks from `.did` files, and gives AI tools a predictable project shape.

## Core Decisions From Planning

- Product name: `@ic-reactor/start`.
- V0 rendering model: CSR/static only.
- V0 deploy target: ICP asset canister.
- Do not fork TanStack Start for V0; compose TanStack Router, IC Reactor, and
  `icp-cli`.
- `@ic-reactor/vite-plugin` remains the owner of canister env injection and
  codegen integration.
- `@ic-reactor/codegen` remains the only canister binding generation pipeline.
- `icp-cli` is the source of truth for local network state, canister IDs,
  deploys, and asset sync.
- Do not introduce `.env` canister ID workflows.
- Backend code remains real ICP canisters; `@ic-reactor/start` may scaffold and
  manage them, but should not hide canister boundaries in V0.
- Fully on-chain SEO should be framed as on-chain SEO rendering, not generic
  Node SSR.

## V0 Key Changes

### New Package

Add `@ic-reactor/start`.

It should export:

- `defineIcReactorStartConfig`
- `icReactorStart` Vite plugin preset
- public types for starter canister config

It should compose `@ic-reactor/vite-plugin` rather than duplicating canister env
or codegen behavior.

Expected dependency posture:

- Depends on `@ic-reactor/vite-plugin`.
- Peer-depends on Vite, React, TanStack Router, and React Query.
- Uses `@icp-sdk/core` and optionally `@icp-sdk/auth` in generated apps.

### Create Command

Add a scaffold command/package:

```bash
pnpm create ic-reactor-start my-app
```

Also add this alias if it fits the existing CLI structure:

```bash
ic-reactor create start my-app
```

The scaffold should default to TypeScript, React, TanStack Router file routes,
IC Reactor, `@icp-sdk/core`, `@icp-sdk/auth`, and `icp-cli` project config.

### Generated Project Layout

Default generated layout:

```text
my-app/
  icp.yaml
  ic-reactor.json
  backend/
    canister.yaml
    main.mo
    backend.did
  frontend/
    canister.yaml
    package.json
    vite.config.ts
    src/
      main.tsx
      routeTree.gen.ts
      routes/
      lib/
        client.ts
        auth.ts
      canisters/
        backend/
```

### ICP Configuration

The scaffold should generate:

- `icp.yaml` with `backend` and `frontend` canisters.
- A managed local network with Internet Identity enabled.
- `frontend/canister.yaml` that builds the Vite app and syncs `dist`.
- `backend/canister.yaml` that defaults to Motoko for V0 starter simplicity.
- `ic-reactor.json` that configures the `backend` canister with
  `backend/backend.did`.

Use `icp-cli` commands as the workflow:

```bash
icp network start -d
icp deploy
icp sync
icp deploy -e ic
```

### Vite Preset

Expose this Vite API:

```ts
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { icReactorStart } from "@ic-reactor/start/plugin/vite"

export default defineConfig({
  plugins: [
    icReactorStart({
      canisters: {
        backend: {
          didFile: "../backend/backend.did",
        },
      },
    }),
    react(),
  ],
})
```

`icReactorStart` should:

- Pass normalized canister config into `@ic-reactor/vite-plugin`.
- Include TanStack Router plugin defaults.
- Preserve existing `ic_env` cookie injection behavior.
- Proxy local `/api` to the current `icp-cli` local gateway/replica.
- Support the existing `ICP_ENVIRONMENT` behavior.
- Avoid hard-coded canister IDs.

### Generated App Behavior

The default app should:

- Render a home route with a sample backend query/update.
- Include Internet Identity login/logout.
- Export `queryClient`, `clientManager`, and `authentication`.
- Use generated backend hooks from the generated canister wrapper.
- Work locally after `icp deploy` with no `.env` file.
- Build to static assets deployable through the asset canister.

## V0 Documentation

Add docs for:

- Creating an ICP React app.
- Local dev with `icp-cli`.
- How `ic_env` and runtime canister ID resolution work.
- Deploying locally.
- Deploying to mainnet with `icp deploy -e ic`.
- Why V0 is CSR/static.
- What SSR, SSG, and on-chain SEO mean on ICP.

Important wording:

- Do not call V0 a TanStack Start clone.
- Position it as the React/TanStack app starter for fully on-chain ICP
  frontends.
- Say SSR/server functions are future work.
- Say on-chain SEO rendering is the ICP-native long-term path.

## Test Plan

### Unit Tests

- Vite preset creates the expected plugin composition.
- Vite preset passes canister config to `@ic-reactor/vite-plugin`.
- Config helpers normalize object-based canister config to the existing
  `CanisterConfig[]` shape.
- Template rendering rejects invalid app names.

### Scaffold Tests

- Creating an app writes expected `icp.yaml`, `canister.yaml`,
  `ic-reactor.json`, `vite.config.ts`, and React source files.
- Generated package scripts match the supported flow.
- Re-running create into a non-empty directory fails clearly unless a force flag
  is provided.

### Integration Checks

- Scaffold a temp app.
- Install dependencies.
- Run `pnpm build`.
- Run `pnpm exec tsc --noEmit`.
- Run IC Reactor generation against the scaffolded `.did`.

### Manual Acceptance

- Run `icp network start -d`.
- Run `icp deploy`.
- Run `pnpm dev`.
- Confirm the browser loads the app.
- Confirm the app resolves backend canister ID without `.env`.
- Confirm the sample backend call works.
- Confirm local Internet Identity login works.

## Roadmap

### V0.1: Polished CSR Starter

- Add template variants: `minimal`, `auth`, and `dashboard`.
- Add `ic-reactor start doctor`.
- Improve diagnostics for missing `icp-cli`, stopped local network, undeployed
  canisters, missing `.did` files, and stale generated files.
- Add docs optimized for AI agents and Caffeine-style code generation.

### V0.2: Static SEO / Prerender

- Add build-time prerendering for known public routes.
- Generate route-level title, description, Open Graph tags, canonical links,
  `robots.txt`, and `sitemap.xml`.
- Keep output deployable to the ICP asset canister.
- Add a route convention for public SEO metadata.
- Separate public prerenderable data from authenticated client-only data.

### V0.3: Backend Scaffolding Helpers

Add commands:

```bash
ic-reactor add canister posts
ic-reactor add method posts create_post
```

These should generate or update:

- canister source
- `.did`
- `canister.yaml`
- `ic-reactor.json`
- frontend wrapper/import examples

Backend code remains a real ICP canister.

### V1: Production ICP App Framework Preset

- Stabilize `@ic-reactor/start` APIs.
- Support multi-canister apps as a first-class default.
- Add mainnet deployment guide with cycles/controller checklist.
- Add versioned templates and migration notes.
- Add CI template for build, typecheck, canister build, and asset sync
  validation.

### V2: On-Chain SEO Rendering

- Add optional SEO/http canister template.
- Serve dynamic public HTML through canister `http_request`.
- Support certified static and dynamic responses where practical.
- Generate dynamic social preview/meta pages for public app data.
- Keep authenticated and identity-specific data client-only.

### V3: Advanced Full-Stack Abstractions

Explore colocated backend declarations only if there is a clear compiler target.

Possible future syntax:

```ts
export const createPost = ic.update({
  args: [text],
  returns: Post,
  handler: async (title) => {
    // generated into a real backend canister
  },
})
```

Do not implement this until backend language target, Candid generation, stable
memory strategy, upgrade behavior, and deployment semantics are fully specified.
