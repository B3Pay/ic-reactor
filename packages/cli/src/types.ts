/**
 * CLI-specific Types
 *
 * Shared types (MethodInfo, CanisterConfig, HookType, GeneratorOptions)
 * are now in @ic-reactor/codegen.
 */

import type { CanisterConfig, HookType } from "@ic-reactor/codegen"

export interface HookConfig {
  name: string
  type?: HookType
}

export interface ReactorConfig {
  /** Schema version */
  $schema?: string
  /** Output directory for generated files */
  outDir: string
  /** Default path to client manager import (can be overridden per canister) */
  clientManagerPath?: string
  /** Canister configurations */
  canisters: Record<string, CanisterConfig>
  /** Track which hooks have been generated */
  generatedHooks: Record<string, Array<string | HookConfig>>
}
