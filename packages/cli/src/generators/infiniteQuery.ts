/**
 * Infinite Query hook generator
 *
 * Generates createInfiniteQuery-based hooks for paginated canister methods.
 */

import {
  type MethodInfo,
  type HookType,
  generateInfiniteQueryHook as generateInfiniteQueryHookFromCodegen,
} from "@ic-reactor/codegen"
import type { ReactorConfig } from "../types.js"

export interface InfiniteQueryHookOptions {
  canisterName: string
  method: MethodInfo
  type?: HookType
  config: ReactorConfig // Unused
}

/**
 * Generate an infinite query hook file content
 */
export function generateInfiniteQueryHook(
  options: InfiniteQueryHookOptions
): string {
  const { canisterName, method, type } = options

  return generateInfiniteQueryHookFromCodegen({
    canisterName,
    method,
    type,
  })
}
