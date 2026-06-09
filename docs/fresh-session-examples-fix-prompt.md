# Fresh Session Prompt: Fix And Test All Examples

Paste this into a fresh Codex session opened at `/Users/b3hr4d/Coding/B3Pay/ic-reactor`.

```text
We are working in `/Users/b3hr4d/Coding/B3Pay/ic-reactor`.

Goal: continue the same local-example cleanup/fix workflow we already did for `all-in-one-demo` and `tanstack-router`, but now apply it to the remaining examples one by one. I want each example to run locally, use the package-level ICP CLI/local II environment defaults, and avoid unnecessary per-example auth/env hardcoding.

Important context from the previous session:

- ICP CLI was upgraded to `0.2.7`.
- ICP CLI has built-in local Internet Identity.
- Built-in local II should be reached at:
  `http://id.ai.localhost:8000/authorize`
- The earlier `Error 503 Response Verification Error` was caused by using the wrong/certified local II path/domain. Local built-in II needs `/authorize`.
- We changed the package so examples should not need `withCanisterEnv: true`.
- `ClientManager` now auto-detects `ic_env` in the browser when present.
- `AuthenticationManager` now auto-detects local II from `ic_env`.
- `withCanisterEnv: false` remains as the explicit opt-out.
- `AuthenticationManager` has an auth-specific fallback parser for provider-only `ic_env` cookies because `safeGetCanisterEnv()` requires `IC_ROOT_KEY`.
- `@ic-reactor/vite-plugin` now injects:
  `INTERNET_IDENTITY_PROVIDER=http://id.ai.localhost:8000/authorize`
  into `ic_env` for local ICP CLI built-in II.
- Env-only Vite plugin usage is supported with:
  `icReactor({ canisters: [] })`
- `auth-react` now calls `authentication.prepareClient()` during mount so the auth client is prepared before a user click.

Already updated examples:

- `examples/all-in-one-demo`
- `examples/tanstack-router`

Relevant memory file:

- `docs/local-examples-session-memory.md`

Please read that file first, then continue with the remaining examples.

Workflow I want:

1. List all examples under `examples/`.
2. Identify which examples are already fixed and which still need attention.
3. For each remaining example, one by one:
   - inspect its package scripts and local setup;
   - remove unnecessary `withCanisterEnv: true` usage from app/example code;
   - remove hardcoded `identityProvider` values unless the example is specifically about custom providers;
   - use package-level `AuthenticationManager({ clientManager })` defaults where possible;
   - add `@ic-reactor/vite-plugin` / `icReactor(...)` only where it is the right local-environment source;
   - for Vite examples that do not need canister codegen but need env/local II, use `icReactor({ canisters: [] })`;
   - prefer ICP CLI built-in II over a manual `internet_identity` canister;
   - update docs/readmes if they still teach `withCanisterEnv: true` as required;
   - keep generated files isolated and call out generated churn clearly.
4. Run the example locally on an available localhost port.
5. Verify with the in-app browser when possible:
   - page renders;
   - no Vite overlay;
   - local env cookie/header exists when expected;
   - auth button is wired to package defaults.
6. Run the relevant build/test commands for the package/example.
7. Stop the dev server before moving to the next example, unless I ask to keep it open.
8. Keep a concise checklist of progress.

Browser/auth caveat:

- In the previous session, the in-app browser could render pages and click normal app buttons, but SDK Internet Identity popups did not always surface through automation. Direct local II endpoint did load with title `Internet Identity`.
- Do not overfit to browser automation failing to expose the popup. Verify the provider URL/cookie and direct II endpoint, and call out when manual click is needed.

Commands/checks that passed previously:

- `pnpm --filter @ic-reactor/core test -- client-manager.test.ts`
- `pnpm --filter @ic-reactor/auth test -- authentication-manager.test.ts`
- `pnpm --filter @ic-reactor/auth-react test -- createAuthHooks.test.tsx`
- `pnpm --filter @ic-reactor/vite-plugin test -- index.test.ts`
- `pnpm --filter @ic-reactor/core build`
- `pnpm --filter @ic-reactor/auth build`
- `pnpm --filter @ic-reactor/auth-react build`
- `pnpm --filter @ic-reactor/codegen build`
- `pnpm run build` in `examples/tanstack-router`

Current known dirty-worktree context from the previous session:

- There are intentional package/example changes around automatic `ic_env`, local II, auth preparation, and simplified examples.
- `pnpm-lock.yaml` has large churn from `pnpm install`.
- `examples/tanstack-router/src/routeTree.gen.ts` has generated churn.
- Do not revert unrelated changes unless I explicitly ask.

Please start by reading `docs/local-examples-session-memory.md`, then inspect `examples/`, create a short plan/checklist, and begin with the next not-yet-fixed example.
```
