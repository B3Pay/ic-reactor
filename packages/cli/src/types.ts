/**
 * CLI Types
 */

export interface MethodInfo {
  name: string
  type: "query" | "mutation"
  hasArgs: boolean
  argsDescription?: string
  returnDescription?: string
}

export interface CanisterConfig {
  /** Path to the .did file */
  didFile: string
  /** Path to the client manager import */
  clientManagerPath?: string
  /** Use DisplayReactor for automatic type transformations */
  useDisplayReactor?: boolean
  /** Custom canister ID (optional, uses environment by default) */
  canisterId?: string
}

export interface ReactorConfig {
  /** Schema version */
  $schema?: string
  /** Output directory for generated files */
  outDir: string
  /** Canister configurations */
  canisters: Record<string, CanisterConfig>
  /** Track which hooks have been generated */
  generatedHooks: Record<string, string[]>
}

export interface GeneratorOptions {
  canisterName: string
  methodName: string
  methodType: "query" | "mutation"
  hasArgs: boolean
  outDir: string
  config: ReactorConfig
}

export type HookType =
  | "query"
  | "suspenseQuery"
  | "infiniteQuery"
  | "suspenseInfiniteQuery"
  | "mutation"
