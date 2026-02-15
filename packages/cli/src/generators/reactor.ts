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
}

/**
 * Generate the reactor.ts file content
 */
export function generateReactorFile(options: ReactorGeneratorOptions): string {
  const { canisterName, canisterConfig, config } = options

  return generateReactorFileFromCodegen({
    canisterName,
    canisterConfig,
    globalClientManagerPath: config.clientManagerPath,
  })
}
