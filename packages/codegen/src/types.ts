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
  /** Optional fixed canister ID */
  canisterId?: string
}

export type ReactorMode = "raw" | "display"

export interface ReactorGenerationConfig {
  /**
   * Default reactor mode used for generated hook exports.
   * `display` preserves current behavior.
   */
  defaultMode?: ReactorMode
  /**
   * Optional per-canister overrides keyed by canister name.
   * Example: { workflow_engine: "raw" }
   */
  canisters?: Record<string, ReactorMode>
}

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
  /** Optional reactor mode generation settings */
  reactor?: ReactorGenerationConfig
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
