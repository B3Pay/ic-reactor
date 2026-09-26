/**
 * Canister entrypoint.
 *
 * Created once by @ic-reactor/codegen and safe to customize.
 * Keep the re-exports below if you want generated exports and types to stay in sync.
 *
 * Recommended customization points:
 * - define app-specific query/mutation factories next to the generated ones
 * - add app-specific hooks and cache invalidation wiring
 * - compose generated APIs into route loaders/actions
 *
 * Do not edit `index.generated.ts` or `index.factories.generated.ts`; they
 * are regenerated on each codegen run.
 * AI guide: https://ic-reactor.b3pay.net/llms-full.txt
 * Agent skill: in Claude Code, /plugin marketplace add B3Pay/ic-reactor then
 * /plugin install ic-reactor@ic-reactor; for other agents,
 * npx skills add B3Pay/ic-reactor --skill ic-reactor
 */
export * from "./index.generated"
export * from "./index.factories.generated"
