/**
 * @ic-reactor/start
 *
 * React/TanStack app starter for fully on-chain Internet Computer frontends.
 *
 * V0 is CSR/static only and deploys to an ICP asset canister. It composes
 * IC Reactor, TanStack Router, and `icp-cli` — it is NOT a TanStack Start
 * clone. SSR, server functions, and colocated backend functions are future
 * work (see `docs/plans/ic-reactor-start-v0.md`).
 *
 * Public surface:
 * - `defineIcReactorStartConfig` / config types
 * - `icReactorStart` Vite preset lives at `@ic-reactor/start/plugin/vite`
 * - `createApp` scaffold lives at `@ic-reactor/start/scaffold`
 */

export * from "./config.js"
