# IC Reactor Start Example

This example shows the intended V0 shape for `@ic-reactor/start`: a static
React app using TanStack Router, generated IC Reactor hooks, Internet Identity
auth helpers, and `icp-cli` project configuration.

```bash
pnpm install
pnpm build
icp network start -d
icp deploy
pnpm dev
```

The frontend is deployed as static assets to an ICP asset canister. Canister IDs
come from `icp-cli` and the `ic_env` cookie injected by the Vite preset, not
from `.env` files.

## What To Look At

- `frontend/vite.config.ts` uses `icReactorStart`.
- `icp.yaml` lists the real `backend` and `frontend` canisters.
- `backend/backend.did` is the source for generated frontend hooks.
- `frontend/src/lib/client.ts` exports `queryClient`, `clientManager`, and
  `authentication`.
