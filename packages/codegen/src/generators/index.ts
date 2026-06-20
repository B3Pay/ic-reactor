/**
 * Generator exports
 *
 * All individual generators are exported here.
 * The pipeline composes them; CLI and vite-plugin use them via the pipeline.
 */

export {
  buildTypedBindings,
  generateGeneratedFile,
  generateEntryFile,
} from "./declarations.js"
export type {
  TypedBindingsOptions,
  TypedBindingsResult,
  GeneratedFileOptions,
  GeneratedFileResult,
} from "./declarations.js"

export {
  generateReactorFile,
  generateReactorBlock,
  generateReactorEntryFile,
} from "./reactor.js"
export type { ReactorGeneratorOptions, ReactorBlockOptions } from "./reactor.js"

export { generateClientFile } from "./client.js"
export type { ClientGeneratorOptions } from "./client.js"
