/**
 * Generator exports
 *
 * All individual generators are exported here.
 * The pipeline composes them; CLI and vite-plugin use them via the pipeline.
 */

export { generateDeclarations, declarationsExist } from "./declarations.js"
export type {
  DeclarationsGeneratorOptions,
  DeclarationsGeneratorResult,
} from "./declarations.js"

export { generateReactorFile } from "./reactor.js"
export type { ReactorGeneratorOptions } from "./reactor.js"

export { generateClientFile } from "./client.js"
export type { ClientGeneratorOptions } from "./client.js"
