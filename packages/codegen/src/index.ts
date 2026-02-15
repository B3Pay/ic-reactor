/**
 * @ic-reactor/codegen
 *
 * Shared code generation utilities for IC Reactor.
 * Used by both @ic-reactor/vite-plugin and @ic-reactor/cli.
 */

// Types
export type { CanisterConfig, ReactorGeneratorOptions } from "./types.js"

// Naming utilities
export { toPascalCase, getReactorName, getServiceTypeName } from "./naming.js"

// Bindgen utilities
export {
  generateDeclarations,
  declarationsExist,
  saveCandidFile,
} from "./bindgen.js"
export type { BindgenOptions, BindgenResult } from "./bindgen.js"

// Template generators
export { generateReactorFile } from "./templates/reactor.js"
export { generateClientFile } from "./templates/client.js"
export type { ClientGeneratorOptions } from "./templates/client.js"
