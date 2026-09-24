/**
 * Reactor File Generator
 *
 * Generates the managed `index.generated.ts` implementation for a canister.
 * React targets also emit the full set of typed hooks via `createActorHooks`.
 *
 * Generated output example (for canister "backend"):
 *
 *   import { DisplayReactor, createActorHooks } from "@ic-reactor/react"
 *   import { clientManager } from "../../clients"
 *   import { idlFactory, type _SERVICE } from "./declarations/backend"
 *
 *   export type BackendService = _SERVICE
 *
 *   export const backendReactor = new DisplayReactor<BackendService>({ ... })
 *
 *   export const {
 *     useActorQuery: useBackendQuery,
 *     ...
 *   } = createActorHooks(backendReactor)
 */

import {
  ACTOR_HOOK_EXPORTS,
  getReactorName,
  getServiceTypeName,
  toPascalCase,
} from "../naming.js"
import type { CodegenTarget, ReactorClassName } from "../types.js"
import { resolveDeclarationsBaseName } from "../validate.js"

export interface ReactorGeneratorOptions {
  /** Canister name (e.g. "backend") */
  canisterName: string
  /**
   * Path to the .did file. Used to derive the declarations import path.
   * Can be relative or absolute — only the basename is used.
   */
  didFile: string
  /**
   * Import path for the client manager, relative from the generated reactor file.
   * Default: "../../clients"
   */
  clientManagerPath?: string
  /** Canister ID written into the generated reactor; see `CanisterConfig.canisterId`. */
  canisterId?: string
  /** Generated runtime target */
  runtimeTarget?: CodegenTarget
  /**
   * Which reactor class should back the generated hooks.
   * Default: "DisplayReactor" (backward compatible)
   */
  reactorClass?: ReactorClassName
}

function getReactorClassImportSource(
  reactorClass: ReactorClassName,
  runtimeTarget: CodegenTarget
): "@ic-reactor/react" | "@ic-reactor/core" | "@ic-reactor/candid" {
  switch (reactorClass) {
    case "Reactor":
    case "DisplayReactor":
      return runtimeTarget === "core" ? "@ic-reactor/core" : "@ic-reactor/react"
    case "CandidReactor":
    case "CandidDisplayReactor":
    case "MetadataDisplayReactor":
      return "@ic-reactor/candid"
    default:
      // The pipeline validates `mode` against a closed set before we are
      // reached. Failing closed here means a caller that skips validation gets
      // an error rather than an unknown class name interpolated into source.
      throw new Error(
        `Unknown reactor class ${JSON.stringify(reactorClass)}. Expected one of: ` +
          `Reactor, DisplayReactor, CandidReactor, CandidDisplayReactor, MetadataDisplayReactor.`
      )
  }
}

/**
 * The transform the generated code names in the type arguments of a call that
 * takes the reactor, or `undefined` when TypeScript should infer it.
 *
 * `createActorHooks` has one overload for `DisplayReactor<Service>` and one for
 * `Reactor<Service, Transform>`. For those two classes TypeScript reads the type
 * arguments off the reactor's type. The @ic-reactor/candid classes extend them,
 * so TypeScript can only infer `Service` by comparing every member of the
 * subclass with the base class. For a service as large as Internet Identity's,
 * or one with a recursive type such as Motoko's `List`, that comparison passes
 * TypeScript's instantiation limit, and the generated file fails to compile with
 * TS2589. Passing the service and the class's transform skips the inference and
 * produces the same hooks. The generated query and mutation factories take
 * the reactor as `Reactor<Service, Transform>` too, and are passed the same
 * type arguments, so they never depend on that inference either.
 *
 * The core classes keep the inferred call, so their output does not change.
 */
export function getExplicitTransform(
  reactorClass: ReactorClassName
): "candid" | "display" | "metadataDisplay" | undefined {
  switch (reactorClass) {
    case "Reactor":
    case "DisplayReactor":
      return undefined
    case "CandidReactor":
      return "candid"
    case "CandidDisplayReactor":
      return "display"
    case "MetadataDisplayReactor":
      return "metadataDisplay"
    default:
      // getReactorClassImportSource has already rejected any other value.
      throw new Error(`Unknown reactor class ${JSON.stringify(reactorClass)}.`)
  }
}

/**
 * The type arguments the generated `createActorHooks` call passes, or an empty
 * string when TypeScript should infer them. See {@link getExplicitTransform}.
 */
function getHookTypeArguments(
  reactorClass: ReactorClassName,
  serviceName: string
): string {
  const transform = getExplicitTransform(reactorClass)
  return transform === undefined
    ? ""
    : `<${serviceName}, ${JSON.stringify(transform)}>`
}

/**
 * Generate the content of a canister's managed implementation file.
 */
export function generateReactorFile(options: ReactorGeneratorOptions): string {
  const {
    canisterName,
    didFile,
    clientManagerPath = "../../clients",
    canisterId,
    runtimeTarget = "react",
    reactorClass = "DisplayReactor",
  } = options

  const pascalName = toPascalCase(canisterName)
  const reactorName = getReactorName(canisterName)
  const serviceName = getServiceTypeName(canisterName)

  // Derive the declarations import path from the .did filename. The helper
  // rejects stems like "." and ".." rather than emitting an import of a
  // directory — this runs even for callers that bypass the pipeline.
  const baseName = resolveDeclarationsBaseName(didFile)
  const declarationsPath = `./declarations/${baseName}`
  const reactorImportSource = getReactorClassImportSource(
    reactorClass,
    runtimeTarget
  )
  const canisterIdLine = canisterId
    ? `  canisterId: ${JSON.stringify(canisterId)},\n`
    : ""
  const hookBindings = ACTOR_HOOK_EXPORTS.map(
    ([member, suffix]) => `  ${member}: use${pascalName}${suffix},\n`
  ).join("")
  const hookExports =
    runtimeTarget === "react"
      ? `

export const {
${hookBindings}} = createActorHooks${getHookTypeArguments(reactorClass, serviceName)}(${reactorName})
`
      : ""

  // Every interpolation into emitted source is JSON.stringify'd. The pipeline
  // validates these values before we are called; quoting them here as well
  // means a future caller that skips validation cannot inject source text.
  return `${runtimeTarget === "react" ? 'import { createActorHooks } from "@ic-reactor/react"\n' : ""}import { ${reactorClass} } from ${JSON.stringify(reactorImportSource)}
import { clientManager } from ${JSON.stringify(clientManagerPath)}
import { idlFactory, type _SERVICE } from ${JSON.stringify(declarationsPath)}

export type ${serviceName} = _SERVICE

/**
 * ${pascalName} Reactor
 *
 * Auto-generated by @ic-reactor/codegen — do not edit.
 * This file is overwritten whenever generation runs.
 *
 * Keep app-specific logic in the stable \`index.ts\` wrapper (or adjacent
 * factory modules). Avoid editing this managed file directly.
 */
export const ${reactorName} = new ${reactorClass}<${serviceName}>({
  clientManager,
  idlFactory,
${canisterIdLine}  name: ${JSON.stringify(canisterName)},
})${hookExports || "\n"}`
}

/**
 * Options for {@link generateReactorEntryFile}.
 *
 * @example
 * generateReactorEntryFile({ factories: true })
 * // …
 * // export * from "./index.generated"
 * // export * from "./index.factories.generated"
 */
export interface ReactorEntryGeneratorOptions {
  /**
   * Whether `index.factories.generated.ts` is generated too. The wrapper then
   * re-exports it next to `index.generated.ts`. Default: `false`.
   */
  factories?: boolean
}

/**
 * Generate the user-facing `index.ts` wrapper content. With
 * `{ factories: true }` it re-exports `index.factories.generated.ts` as well;
 * without options it is the wrapper earlier versions wrote.
 *
 * @example
 * createFile(path.join(canisterOutDir, "index.ts"), generateReactorEntryFile())
 */
export function generateReactorEntryFile(
  options: ReactorEntryGeneratorOptions = {}
): string {
  if (options.factories) {
    return `/**
 * Canister entrypoint.
 *
 * Created once by @ic-reactor/codegen and safe to customize.
 * Keep the re-exports below if you want generated exports and types to stay in sync.
 *
 * Recommended customization points:
 * - define app-specific query/mutation factories next to the generated ones
 * - add app-specific hooks and cache invalidation wiring
 * - compose generated APIs into route loaders/actions
 *
 * Do not edit \`index.generated.ts\` or \`index.factories.generated.ts\`; they
 * are regenerated on each codegen run.
 * AI guide: https://ic-reactor.b3pay.net/llms-full.txt
 * Skill install: npx skills add B3Pay/ic-reactor-skills --full-depth --skill ic-reactor-hooks
 */
export * from "./index.generated"
export * from "./index.factories.generated"
`
  }

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
 * Do not edit \`index.generated.ts\`; it is regenerated on each codegen run.
 * AI guide: https://ic-reactor.b3pay.net/llms-full.txt
 * Skill install: npx skills add B3Pay/ic-reactor-skills --full-depth --skill ic-reactor-hooks
 */
export * from "./index.generated"
`
}
