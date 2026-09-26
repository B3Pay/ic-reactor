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
  FactoryMethod,
  GeneratorResult,
  ReactorClassName,
} from "./types.js"

// Pipeline (Primary Entry Point)
export { runCanisterPipeline } from "./pipeline.js"
export type { PipelineOptions, PipelineResult } from "./pipeline.js"

// Utilities
export {
  toPascalCase,
  getReactorName,
  getServiceTypeName,
  getFactoryExportNames,
} from "./naming.js"

// Config validation (run by the pipeline; exported for callers that want to
// validate a config before invoking generation)
export {
  assertSafeCanisterConfig,
  assertSafeCanisterName,
  assertSafeModuleSpecifier,
  assertContainedPath,
  assertOneOf,
  resolveContainedOutDir,
  resolveDeclarationsBaseName,
  CodegenConfigError,
  CANISTER_NAME_PATTERN,
  REACTOR_CLASS_NAMES,
  CODEGEN_TARGETS,
} from "./validate.js"
export type {
  ValidatedCanisterPaths,
  ValidateCanisterConfigOptions,
} from "./validate.js"

// Entries that would generate into one directory (run by the CLI and the vite
// plugin across every configured entry)
export { findSharedOutDirs, sharedOutDirMessage } from "./shared-out-dir.js"

// Individual Generators (Advanced Usage)
export * from "./generators/index.js"
