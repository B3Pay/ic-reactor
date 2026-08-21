/**
 * @ic-reactor/codegen
 *
 * Shared code generation utilities for IC Reactor.
 * Used by @ic-reactor/cli and @ic-reactor/vite-plugin.
 */

// Core Types
export type {
  CanisterConfig,
  CodegenConfig,
  CodegenTarget,
  GeneratorResult,
  ReactorClassName,
} from "./types.js"

// Pipeline (Primary Entry Point)
export { runCanisterPipeline } from "./pipeline.js"
export type { PipelineOptions, PipelineResult } from "./pipeline.js"

// Utilities
export { toPascalCase, getReactorName, getServiceTypeName } from "./naming.js"

// Config validation (run by the pipeline; exported for callers that want to
// validate a config before invoking generation)
export {
  assertSafeCanisterConfig,
  assertSafeCanisterName,
  assertSafeModuleSpecifier,
  assertContainedPath,
  assertOneOf,
  resolveContainedOutDir,
  CodegenConfigError,
  CANISTER_NAME_PATTERN,
  REACTOR_CLASS_NAMES,
  CODEGEN_TARGETS,
} from "./validate.js"
export type {
  ValidatedCanisterPaths,
  ValidateCanisterConfigOptions,
} from "./validate.js"

export { parseDIDFile, extractMethods } from "./parser.js"
export type { MethodInfo, MethodType } from "./parser.js"

// Individual Generators (Advanced Usage)
export * from "./generators/index.js"
