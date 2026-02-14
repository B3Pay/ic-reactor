/**
 * Query hook generator
 *
 * Generates createQuery-based hooks for canister query methods.
 */

import {
  type MethodInfo,
  type HookType,
  generateQueryHook as generateQueryHookFromCodegen,
} from "@ic-reactor/codegen"
import type { ReactorConfig } from "../types.js"

export interface QueryHookOptions {
  canisterName: string
  method: MethodInfo
  config: ReactorConfig // Not used by codegen but kept for CLI consistency if needed
  type?: HookType
}

/**
 * Generate a query hook file content
 */
export function generateQueryHook(options: QueryHookOptions): string {
  const { canisterName, method, type } = options

  return generateQueryHookFromCodegen({
    canisterName,
    method,
    type,
  })
}
