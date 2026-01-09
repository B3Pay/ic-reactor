/**
 * Naming utilities for code generation
 */

/**
 * Convert string to PascalCase
 * @example toPascalCase("get_message") -> "GetMessage"
 */
export function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("")
}

/**
 * Convert string to camelCase
 * @example toCamelCase("get_message") -> "getMessage"
 */
export function toCamelCase(str: string): string {
  const pascal = toPascalCase(str)
  return pascal.charAt(0).toLowerCase() + pascal.slice(1)
}

/**
 * Generate hook file name
 * @example getHookFileName("get_message", "query") -> "getMessageQuery.ts"
 */
export function getHookFileName(methodName: string, hookType: string): string {
  const camelMethod = toCamelCase(methodName)
  const pascalType = toPascalCase(hookType)
  return `${camelMethod}${pascalType}.ts`
}

/**
 * Generate hook export name
 * @example getHookExportName("get_message", "query") -> "getMessageQuery"
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
 * @example getReactHookName("get_message", "query") -> "useGetMessageQuery"
 */
export function getReactHookName(methodName: string, hookType: string): string {
  const pascalMethod = toPascalCase(methodName)
  const pascalType = toPascalCase(hookType)
  return `use${pascalMethod}${pascalType}`
}

/**
 * Generate reactor variable name
 * @example getReactorName("backend") -> "backendReactor"
 */
export function getReactorName(canisterName: string): string {
  return `${toCamelCase(canisterName)}Reactor`
}

/**
 * Generate service type name
 * @example getServiceTypeName("backend") -> "BackendService"
 */
export function getServiceTypeName(canisterName: string): string {
  return `${toPascalCase(canisterName)}Service`
}
