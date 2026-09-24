/**
 * @ic-reactor/codegen — Core Types
 *
 * All shared types used across generators, pipeline, CLI, and vite-plugin.
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Per-canister configuration.
 * `name` is always required — it drives all naming in generators.
 */
export interface CanisterConfig {
  /** Canister name (used for variable names, file names, etc.) */
  name: string
  /** Path to the .did file (relative to project root, or absolute) */
  didFile: string
  /** Override output dir for this specific canister */
  outDir?: string
  /**
   * Import path to the ClientManager (relative from the generated reactor file).
   * Example: "../../clients" → `import { clientManager } from "../../clients"`
   */
  clientManagerPath?: string
  /**
   * Reactor class used for generated hooks in this canister.
   * Defaults to DisplayReactor for backward compatibility.
   */
  mode?: ReactorClassName
  /**
   * Generated runtime target.
   * `react` emits bound React hooks, `core` emits only the typed reactor exports.
   */
  target?: CodegenTarget
  /**
   * Canister ID written into `index.generated.ts`. Set it for any build not
   * served from a local replica: without it the generated reactor reads the id
   * from the `ic_env` cookie, and importing it throws in Node, during SSR and
   * on a deployed origin.
   */
  canisterId?: string
  /**
   * Also write `index.factories.generated.ts`: one query or mutation object
   * per method of the service, bound to the generated reactor. A query or
   * composite_query method that takes no arguments gets `createQuery`, one
   * that takes arguments gets `createQueryFactory`, and an update or oneway
   * method gets `createMutation`, so an update method is never generated as a
   * query. `getFactoryExportNames` gives the export names.
   *
   * Needs `target: "react"`: the factories come from `@ic-reactor/react`.
   * Default: `false`, which writes no such file and removes one that an
   * earlier run wrote.
   */
  factories?: boolean
}

/**
 * A service method as the factories generator reads it. Each entry of
 * `parseDid(source).service.methods` from `@ic-reactor/parser` has this shape.
 */
export interface FactoryMethod {
  /** The method's name, exactly as the service declares it. */
  name: string
  /** The method's annotation: `update` stands for a method without one. */
  mode: "query" | "composite_query" | "update" | "oneway"
  /** The method's argument types. Only how many there are is read. */
  args: readonly unknown[]
}

export type ReactorClassName =
  | "Reactor"
  | "DisplayReactor"
  | "CandidReactor"
  | "CandidDisplayReactor"
  | "MetadataDisplayReactor"

export type CodegenTarget = "react" | "core"

/**
 * Top-level codegen / CLI configuration (stored in `ic-reactor.json`).
 */
export interface CodegenConfig {
  /** JSON Schema reference */
  $schema?: string
  /**
   * Default output directory for all canisters (relative to project root).
   * Individual canisters can override via `CanisterConfig.outDir`.
   */
  outDir: string
  /**
   * Default import path for the ClientManager (relative from generated files).
   * Individual canisters can override via `CanisterConfig.clientManagerPath`.
   */
  clientManagerPath?: string
  /**
   * Default generated runtime target.
   * Individual canisters can override via `CanisterConfig.target`.
   */
  target?: CodegenTarget
  /** Canister configurations, keyed by canister name */
  canisters: Record<string, CanisterConfig>
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATOR TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Result of a single file-writing generator step.
 */
export interface GeneratorResult {
  success: boolean
  /** Absolute path of the file that was (or would have been) written */
  filePath: string
  /** If true, skipped because the file already existed */
  skipped?: boolean
  error?: string
}
