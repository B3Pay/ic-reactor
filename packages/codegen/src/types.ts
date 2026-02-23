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
  /** Optional fixed canister ID */
  canisterId?: string
}

export type ReactorClassName =
  | "Reactor"
  | "DisplayReactor"
  | "CandidReactor"
  | "CandidDisplayReactor"
  | "MetadataDisplayReactor"

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
