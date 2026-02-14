/**
 * Shared types for IC Reactor code generation
 */

/**
 * Information about a canister method extracted from a .did file
 */
export interface MethodInfo {
  /** Method name as defined in the Candid interface */
  name: string
  /** Whether this method is a query or update (mutation) */
  type: "query" | "mutation"
  /** Whether the method accepts arguments */
  hasArgs: boolean
  /** Human-readable description of the arguments */
  argsDescription?: string
  /** Human-readable description of the return type */
  returnDescription?: string
}

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
  /** Use DisplayReactor for automatic type transformations (default: true) */
  useDisplayReactor?: boolean
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
 * Hook generation type
 */
export type HookType =
  | "query"
  | "suspenseQuery"
  | "infiniteQuery"
  | "suspenseInfiniteQuery"
  | "mutation"

/**
 * Options for generating a hook file
 */
export interface GeneratorOptions {
  canisterName: string
  methodName: string
  methodType: "query" | "mutation"
  hasArgs: boolean
  outDir: string
}

/**
 * Options for reactor file generation
 */
export interface ReactorGeneratorOptions {
  canisterName: string
  canisterConfig: CanisterConfig
  /** Global default clientManagerPath */
  globalClientManagerPath?: string
  /** Whether declarations have been generated */
  hasDeclarations?: boolean
  /** Whether to generate advanced per-method hooks (default: false) */
  advanced?: boolean
  /** DID content (required when advanced=true) */
  didContent?: string
}
