/**
 * CLI-specific Types
 *
 * Most types are now imported from @ic-reactor/codegen to ensure consistency.
 */

import type { CodegenConfig, CanisterConfig } from "@ic-reactor/codegen"

// Re-export for convenience
export type { CodegenConfig, CanisterConfig }

/**
 * CLI arguments for the `init` command
 */
export interface InitOptions {
  yes?: boolean
  outDir?: string
  dryRun?: boolean
}

/**
 * CLI arguments for the `generate` command
 */
export interface GenerateOptions {
  canister?: string
  clean?: boolean
}
