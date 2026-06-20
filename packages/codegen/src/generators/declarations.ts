/**
 * Typed Bindings + Generated File Generator
 *
 * Produces a single TypeScript-only `generated.ts` per canister. The file
 * combines:
 *  - generated service/IDL types from `didToTs`
 *  - the real `idlFactory` / `init` implementation from `didToJs`
 *  - an optional typed reactor + hook block (delegated to `reactor.ts`)
 *
 * V0 of the Candid compiler/codegen evolution: stop emitting parallel `.js`,
 * `.d.ts`, and copied `.did` files. `.did` stays the source contract and is
 * not copied into the generated frontend folder.
 */

import { didToJs, didToTs } from "@ic-reactor/parser"
import type { GeneratorResult } from "../types.js"
import { generateReactorBlock } from "./reactor.js"

export interface TypedBindingsOptions {
  /** Raw Candid (.did) source text. */
  didContent: string
  /**
   * Canister name (used only for error messages).
   */
  canisterName?: string
}

export interface TypedBindingsResult {
  success: boolean
  /** Merged TypeScript content for the bindings section of generated.ts. */
  content: string
  error?: string
}

/**
 * Merge `didToTs` type output with the real `didToJs` factory implementation.
 *
 * The parser emits two parallel strings today:
 *  - `didToTs`: `import type` lines, interface/type declarations, and
 *    `declare const idlFactory` / `declare const init` signatures.
 *  - `didToJs`: the runtime `idlFactory` and `init` arrow functions.
 *
 * For a single `.ts` file we keep the TS type block, drop the `declare const`
 * lines, and append the runtime factory with inline type annotations so both
 * the types and the implementation live in one module.
 */
export function buildTypedBindings(
  options: TypedBindingsOptions
): TypedBindingsResult {
  const { didContent, canisterName } = options

  let jsContent: string
  let tsContent: string
  try {
    jsContent = didToJs(didContent)
    tsContent = didToTs(didContent)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      content: "",
      error: canisterName
        ? `[${canisterName}] Failed to compile Candid: ${message}`
        : `Failed to compile Candid: ${message}`,
    }
  }

  // The TS compiler output ends with `declare const` signatures for the two
  // runtime exports. Strip those — the JS implementation provides the values
  // and we re-annotate them inline below.
  const typeBlock = tsContent
    .split("\n")
    .filter((line) => !line.startsWith("export declare const idlFactory"))
    .filter((line) => !line.startsWith("export declare const init"))
    .join("\n")
    .trimEnd()

  // Extract the runtime `idlFactory` and `init` arrow functions from the JS
  // output and re-annotate them with their TS signatures.
  const idlFactorySignature = extractSignature(tsContent, "idlFactory")
  const initSignature = extractSignature(tsContent, "init")

  const idlFactoryImpl = extractJsExport(jsContent, "idlFactory")
  const initImpl = extractJsExport(jsContent, "init")

  if (!idlFactoryImpl || !initImpl) {
    return {
      success: false,
      content: "",
      error: canisterName
        ? `[${canisterName}] Could not locate idlFactory/init in parser JS output`
        : "Could not locate idlFactory/init in parser JS output",
    }
  }

  const idlFactoryTyped =
    idlFactorySignature != null
      ? idlFactoryImpl.replace(
          "export const idlFactory",
          `export const idlFactory${idlFactorySignature}`
        )
      : idlFactoryImpl

  const initTyped =
    initSignature != null
      ? initImpl.replace(
          "export const init",
          `export const init${initSignature}`
        )
      : initImpl

  const content = [
    typeBlock,
    "",
    "// ── IDL factory ────────────────────────────────────────────────────────────",
    idlFactoryTyped,
    initTyped,
  ].join("\n")

  return { success: true, content }
}

/**
 * Pull a `: <type>` annotation for a given export from the TS compiler output.
 * Example source line: `export declare const idlFactory: IDL.InterfaceFactory;`
 * → returns `: IDL.InterfaceFactory`.
 */
function extractSignature(tsContent: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const re = new RegExp(`export declare const ${escaped}\\s*:\\s*([^;]+);`)
  const match = re.exec(tsContent)
  return match ? `: ${match[1].trim()}` : null
}

/**
 * Extract a single `export const <name> = (...)` arrow function from the JS
 * compiler output, preserving its body. Returns `null` if not found.
 */
function extractJsExport(jsContent: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const re = new RegExp(
    `export const ${escaped}\\s*=\\s*\\([\\s\\S]*?\\)\\s*=>\\s*\\{[\\s\\S]*?\\};`
  )
  const match = re.exec(jsContent)
  return match ? match[0].trim() : null
}

export interface GeneratedFileOptions {
  /** Canister name (e.g. "backend"). */
  canisterName: string
  /** Raw Candid (.did) source text. */
  didContent: string
  /** Path to the .did file. Used only to derive the canister base name. */
  didFile: string
  /**
   * Whether to inline the typed reactor + hook block (the body of what used to
   * live in `index.generated.ts`). When false, only the IDL factory + types are
   * emitted. Default: false.
   */
  includeReactor?: boolean
  /** Optional fixed canister ID for the generated reactor. */
  canisterId?: string
  /** Import path for the client manager (relative from the generated file). */
  clientManagerPath?: string
  /** Generated runtime target. */
  runtimeTarget?: "react" | "core"
  /** Which reactor class backs the generated hooks. */
  reactorClass?:
    | "Reactor"
    | "DisplayReactor"
    | "CandidReactor"
    | "CandidDisplayReactor"
    | "MetadataDisplayReactor"
}

export interface GeneratedFileResult {
  success: boolean
  content: string
  files: GeneratorResult[]
  error?: string
}

/**
 * Build the full contents of a canister's `generated.ts`.
 *
 * When `includeReactor` is true the reactor and hook exports are appended in
 * the same module so consumers import everything from one place. The reactor
 * block imports `idlFactory` / `_SERVICE` from the same file (no separate
 * `declarations/` module).
 */
export function generateGeneratedFile(
  options: GeneratedFileOptions
): GeneratedFileResult {
  const {
    canisterName,
    didContent,
    includeReactor = false,
    canisterId,
    clientManagerPath = "../../clients",
    runtimeTarget = "react",
    reactorClass = "DisplayReactor",
  } = options

  const bindings = buildTypedBindings({ didContent, canisterName })
  if (!bindings.success) {
    return {
      success: false,
      content: "",
      files: [],
      error: bindings.error,
    }
  }

  const header = `/**
 * ${canisterName} generated bindings.
 *
 * AUTO-GENERATED by @ic-reactor/codegen — do not edit.
 * Regenerated from the source .did on every codegen run.
 *
 * Contains: service types, the real idlFactory/init, and (when enabled) the
 * typed reactor + hook exports. Keep app-specific logic in the stable
 * \`index.ts\` wrapper instead of editing this file.
 */
`

  if (!includeReactor) {
    return {
      success: true,
      content: `${header}${bindings.content}\n`,
      files: [],
    }
  }

  const reactorBlock = generateReactorBlock({
    canisterName,
    canisterId,
    clientManagerPath,
    runtimeTarget,
    reactorClass,
    inlineDeclarations: true,
  })

  const content = `${header}${bindings.content}\n\n${reactorBlock}`

  return { success: true, content, files: [] }
}

/**
 * Generate the user-facing `index.ts` wrapper content.
 *
 * Stable, user-owned: created once and not overwritten on subsequent codegen
 * runs unless it still looks like the legacy generated index or the managed
 * wrapper. See `pipeline.ts` for the preservation logic.
 */
export function generateEntryFile(): string {
  return `/**
 * Canister entrypoint.
 *
 * Created once by @ic-reactor/codegen and safe to customize.
 * Keep the re-export below if you want generated exports and types to stay in sync.
 *
 * Recommended customization points:
 * - define reusable query/mutation factories
 * - add app-specific hooks and cache invalidation wiring
 * - compose generated APIs into route loaders/actions
 *
 * Do not edit \`generated.ts\`; it is regenerated on each codegen run.
 * AI guide: https://ic-reactor.b3pay.net/llms-full.txt
 * Skill install: npx skills add B3Pay/ic-reactor-skills --full-depth --skill ic-reactor-hooks
 */
export * from "./generated"
`
}
