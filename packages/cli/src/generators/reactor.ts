/**
 * Reactor file generator
 *
 * Generates the shared reactor instance file for a canister.
 */

import {
  type CanisterConfig,
  generateReactorFile as generateReactorFileFromCodegen,
} from "@ic-reactor/codegen"
import type { ReactorConfig } from "../types.js"

export interface ReactorGeneratorOptions {
  canisterName: string
  canisterConfig: CanisterConfig
  config: ReactorConfig
  outDir: string
  hasDeclarations?: boolean
}

/**
 * Generate the reactor.ts file content
 */
export function generateReactorFile(options: ReactorGeneratorOptions): string {
  const {
    canisterName,
    canisterConfig,
    config,
    hasDeclarations = true,
  } = options

  return generateReactorFileFromCodegen({
    canisterName,
    canisterConfig,
    hasDeclarations,
    globalClientManagerPath: config.clientManagerPath,
    // CLI doesn't currently expose advanced mode per-canister, but we default to false (simple mode)
    // If we want to support it, we'd add 'advanced' to CanisterConfig or ReactorGeneratorOptions
    advanced: false,
  })
}
