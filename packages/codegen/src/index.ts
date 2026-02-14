/**
 * @ic-reactor/codegen
 *
 * Shared code generation utilities for IC Reactor.
 * Used by both @ic-reactor/vite-plugin and @ic-reactor/cli.
 */

// Types
export type {
  MethodInfo,
  CanisterConfig,
  HookType,
  GeneratorOptions,
  ReactorGeneratorOptions,
} from "./types.js"

// Naming utilities
export {
  toPascalCase,
  toCamelCase,
  getHookFileName,
  getHookExportName,
  getReactHookName,
  getReactorName,
  getServiceTypeName,
} from "./naming.js"

// DID parsing
export {
  parseDIDFile,
  extractMethods,
  getMethodsByType,
  formatMethodForDisplay,
} from "./did.js"

// Bindgen utilities
export {
  generateDeclarations,
  declarationsExist,
  saveCandidFile,
} from "./bindgen.js"
export type { BindgenOptions, BindgenResult } from "./bindgen.js"

// Template generators
export { generateReactorFile } from "./templates/reactor.js"
export { generateQueryHook } from "./templates/query.js"
export type { QueryHookOptions } from "./templates/query.js"
export { generateMutationHook } from "./templates/mutation.js"
export type { MutationHookOptions } from "./templates/mutation.js"
export { generateInfiniteQueryHook } from "./templates/infiniteQuery.js"
export type { InfiniteQueryHookOptions } from "./templates/infiniteQuery.js"
