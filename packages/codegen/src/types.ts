/**
 * Shared types for IC Reactor code generation
 */

/**
 * Configuration for a single canister
 */
export interface CanisterConfig {
  /** Path to the .did file */
  didFile: string
  /** Output directory (default: ./src/canisters/<name>) */
  outDir?: string
  /**
   * Path to import ClientManager from (relative to generated file).
   * The file at this path should export: { clientManager: ClientManager }
   * Default: "../../lib/client"
   */
  clientManagerPath?: string
}

/**
 * Options for reactor file generation
 */
export interface ReactorGeneratorOptions {
  canisterName: string
  canisterConfig: CanisterConfig
  globalClientManagerPath?: string
}
