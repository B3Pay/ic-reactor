/**
 * Shared types for IC Reactor code generation
 */

/**
 * Configuration for a single canister
 */
export interface CanisterConfig {
  /** Name of the canister (used for variable naming) */
  name?: string
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
  /** Custom canister ID (optional, uses environment by default) */
  canisterId?: string
}

/**
 * Options for reactor file generation
 */
export interface ReactorGeneratorOptions {
  canisterName: string
  canisterConfig: CanisterConfig
  /** Global default clientManagerPath */
  globalClientManagerPath?: string
}
