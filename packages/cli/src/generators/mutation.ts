/**
 * Mutation hook generator
 *
 * Generates createMutation-based hooks for canister update methods.
 */

import {
  type MethodInfo,
  generateMutationHook as generateMutationHookFromCodegen,
} from "@ic-reactor/codegen"
import type { ReactorConfig } from "../types.js"

export interface MutationHookOptions {
  canisterName: string
  method: MethodInfo
  config: ReactorConfig // Unused
}

/**
 * Generate a mutation hook file content
 */
export function generateMutationHook(options: MutationHookOptions): string {
  const { canisterName, method } = options

  return generateMutationHookFromCodegen({
    canisterName,
    method,
  })
}
