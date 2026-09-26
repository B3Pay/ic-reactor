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

export { generateReactorFile, generateReactorEntryFile } from "./reactor.js"
export type {
  ReactorGeneratorOptions,
  ReactorEntryGeneratorOptions,
} from "./reactor.js"

export { generateFactoriesFile, FACTORIES_FILE_NAME } from "./factories.js"
export type { FactoriesGeneratorOptions } from "./factories.js"

export { generateClientFile } from "./client.js"
export type { ClientGeneratorOptions } from "./client.js"
