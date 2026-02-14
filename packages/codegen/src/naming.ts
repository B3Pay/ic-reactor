/**
 * Naming utilities for code generation
 *
 * Uses the `change-case` library for base transformations,
 * with domain-specific helpers for IC Reactor patterns.
 */

import { camelCase, pascalCase } from "change-case"

// ═══════════════════════════════════════════════════════════════════════════
// BASE CASE CONVERSIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert string to PascalCase
 * @example toPascalCase("get_message") → "GetMessage"
 * @example toPascalCase("my-canister") → "MyCanister"
 */
export function toPascalCase(str: string): string {
  return pascalCase(str)
}

/**
 * Convert string to camelCase
 * @example toCamelCase("get_message") → "getMessage"
 * @example toCamelCase("my-canister") → "myCanister"
 */
export function toCamelCase(str: string): string {
  return camelCase(str)
}

// ═══════════════════════════════════════════════════════════════════════════
// DOMAIN-SPECIFIC NAMING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate hook file name
 * @example getHookFileName("get_message", "query") → "getMessageQuery.ts"
 */
export function getHookFileName(methodName: string, hookType: string): string {
  const camelMethod = toCamelCase(methodName)
  const pascalType = toPascalCase(hookType)
  return `${camelMethod}${pascalType}.ts`
}

/**
 * Generate hook export name
 * @example getHookExportName("get_message", "query") → "getMessageQuery"
 */
export function getHookExportName(
  methodName: string,
  hookType: string
): string {
  const camelMethod = toCamelCase(methodName)
  const pascalType = toPascalCase(hookType)
  return `${camelMethod}${pascalType}`
}

/**
 * Generate React hook name (with use prefix)
 * @example getReactHookName("get_message", "query") → "useGetMessageQuery"
 */
export function getReactHookName(methodName: string, hookType: string): string {
  const pascalMethod = toPascalCase(methodName)
  const pascalType = toPascalCase(hookType)
  return `use${pascalMethod}${pascalType}`
}

/**
 * Generate reactor variable name
 * @example getReactorName("backend") → "backendReactor"
 */
export function getReactorName(canisterName: string): string {
  return `${toCamelCase(canisterName)}Reactor`
}

/**
 * Generate service type name
 * @example getServiceTypeName("backend") → "BackendService"
 */
export function getServiceTypeName(canisterName: string): string {
  return `${toPascalCase(canisterName)}Service`
}
