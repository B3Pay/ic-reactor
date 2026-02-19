/**
 * @ic-reactor/codegen
 *
 * Shared code generation utilities for IC Reactor.
 * Used by @ic-reactor/cli and @ic-reactor/vite-plugin.
 */

// Core Types
export type { CanisterConfig, CodegenConfig, GeneratorResult } from "./types.js"

// Pipeline (Primary Entry Point)
export { runCanisterPipeline } from "./pipeline.js"
export type { PipelineOptions, PipelineResult } from "./pipeline.js"

// Utilities
export { toPascalCase, getReactorName, getServiceTypeName } from "./naming.js"

export { parseDIDFile, extractMethods } from "./parser.js"
export type { MethodInfo, MethodType } from "./parser.js"

// Individual Generators (Advanced Usage)
export * from "./generators/index.js"
