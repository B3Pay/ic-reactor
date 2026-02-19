/**
 * Naming utilities for code generation
 *
 * Pure functions that convert canister/method names to correctly cased
 * identifiers used throughout generated code.
 */

import { camelCase, pascalCase } from "change-case"

// ─────────────────────────────────────────────────────────────────────────────
// BASE CASE CONVERSIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert string to PascalCase.
 * @example toPascalCase("get_message") → "GetMessage"
 * @example toPascalCase("my-canister") → "MyCanister"
 */
export function toPascalCase(str: string): string {
  return pascalCase(str)
}

/**
 * Convert string to camelCase.
 * @example toCamelCase("get_message") → "getMessage"
 * @example toCamelCase("my-canister") → "myCanister"
 */
export function toCamelCase(str: string): string {
  return camelCase(str)
}

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN-SPECIFIC NAMING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate the reactor variable name for a canister.
 * @example getReactorName("backend") → "backendReactor"
 * @example getReactorName("my_canister") → "myCanisterReactor"
 */
export function getReactorName(canisterName: string): string {
  return `${toCamelCase(canisterName)}Reactor`
}

/**
 * Generate the service type name for a canister.
 * @example getServiceTypeName("backend") → "BackendService"
 * @example getServiceTypeName("my_canister") → "MyCanisterService"
 */
export function getServiceTypeName(canisterName: string): string {
  return `${toPascalCase(canisterName)}Service`
}

/**
 * Generate the hook name prefix (PascalCase canister name).
 * Used when naming the destructured hooks: `use<Prefix>Query`, etc.
 * @example getHookPrefix("my_canister") → "MyCanister"
 */
export function getHookPrefix(canisterName: string): string {
  return toPascalCase(canisterName)
}
