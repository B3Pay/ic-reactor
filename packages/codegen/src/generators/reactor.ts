/**
 * Reactor File Generator
 *
 * Generates the reactor (+ hook) block for a canister. The same block is used
 * in two contexts:
 *  - inlined into the merged `generated.ts` (default V0 layout),
 *  - the standalone `index.generated.ts` shape kept for backward compatibility.
 *
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

import path from "node:path"
import { toPascalCase, getReactorName, getServiceTypeName } from "../naming.js"
import type { CodegenTarget, ReactorClassName } from "../types.js"

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
  /** Optional fixed canister ID for the generated reactor */
  canisterId?: string
  /** Generated runtime target */
  runtimeTarget?: CodegenTarget
  /**
   * Which reactor class should back the generated hooks.
   * Default: "DisplayReactor" (backward compatible)
   */
  reactorClass?: ReactorClassName
}

export interface ReactorBlockOptions {
  /** Canister name (e.g. "backend") */
  canisterName: string
  /** Optional fixed canister ID for the generated reactor */
  canisterId?: string
  /** Import path for the client manager, relative from the generated file. */
  clientManagerPath?: string
  /** Generated runtime target */
  runtimeTarget?: CodegenTarget
  /** Which reactor class should back the generated hooks. */
  reactorClass?: ReactorClassName
  /**
   * When true, omit the `import { idlFactory, type _SERVICE }` line because
   * the reactor block is inlined into the same file that defines them.
   * Default: false.
   */
  inlineDeclarations?: boolean
  /**
   * Import specifier for the declarations module. Only used when
   * `inlineDeclarations` is false. Default derives from `canisterName`.
   */
  declarationsPath?: string
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
  }
}

/**
 * Generate the content of a canister's managed implementation file.
 *
 * Kept for backward compatibility. New code should call `generateReactorBlock`
 * directly (it powers both the standalone `index.generated.ts` shape and the
 * inlined reactor section of the merged `generated.ts`).
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

  const baseName = path.basename(didFile, ".did")
  const declarationsPath = `./declarations/${baseName}`

  return generateReactorBlock({
    canisterName,
    canisterId,
    clientManagerPath,
    runtimeTarget,
    reactorClass,
    inlineDeclarations: false,
    declarationsPath,
    includeDocblock: true,
  })
}

/**
 * Generate the reactor (+ hook) block.
 *
 * @param opts.inlineDeclarations when true, omit the `idlFactory`/`_SERVICE`
 *   import because the block is inlined into the same module that defines them.
 * @param opts.includeDocblock when true, prefix the block with the managed-file
 *   doc comment used by the standalone `index.generated.ts` shape.
 */
export function generateReactorBlock(
  opts: ReactorBlockOptions & { includeDocblock?: boolean }
): string {
  const {
    canisterName,
    canisterId,
    clientManagerPath = "../../clients",
    runtimeTarget = "react",
    reactorClass = "DisplayReactor",
    inlineDeclarations = false,
    declarationsPath,
    includeDocblock = false,
  } = opts

  const pascalName = toPascalCase(canisterName)
  const reactorName = getReactorName(canisterName)
  const serviceName = getServiceTypeName(canisterName)

  const resolvedDeclarationsPath =
    declarationsPath ?? `./declarations/${canisterName}`
  const reactorImportSource = getReactorClassImportSource(
    reactorClass,
    runtimeTarget
  )
  const canisterIdLine = canisterId
    ? `  canisterId: ${JSON.stringify(canisterId)},\n`
    : ""
  const hookExports =
    runtimeTarget === "react"
      ? `

export const {
  useActorQuery: use${pascalName}Query,
  useActorSuspenseQuery: use${pascalName}SuspenseQuery,
  useActorInfiniteQuery: use${pascalName}InfiniteQuery,
  useActorSuspenseInfiniteQuery: use${pascalName}SuspenseInfiniteQuery,
  useActorMutation: use${pascalName}Mutation,
  useActorMethod: use${pascalName}Method,
} = createActorHooks(${reactorName})
`
      : ""

  const docblock = includeDocblock
    ? `
/**
 * ${pascalName} Reactor
 *
 * Auto-generated by @ic-reactor/codegen — do not edit.
 * This file is overwritten whenever generation runs.
 *
 * Keep app-specific logic in the stable \`index.ts\` wrapper (or adjacent
 * factory modules). Avoid editing this managed file directly.
 */`
    : `/**
 * ${pascalName} Reactor — typed reactor + hooks.
 * Auto-generated by @ic-reactor/codegen — do not edit.
 */`

  const reactImportLine =
    runtimeTarget === "react"
      ? 'import { createActorHooks } from "@ic-reactor/react"\n'
      : ""
  const declarationsImportLine = inlineDeclarations
    ? ""
    : `import { idlFactory, type _SERVICE } from "${resolvedDeclarationsPath}"\n`

  return `${reactImportLine}import { ${reactorClass} } from "${reactorImportSource}"
import { clientManager } from "${clientManagerPath}"
${declarationsImportLine}
export type ${serviceName} = _SERVICE
${docblock}
export const ${reactorName} = new ${reactorClass}<${serviceName}>({
  clientManager,
  idlFactory,
${canisterIdLine}  name: "${canisterName}",
})${hookExports || "\n"}`
}

/**
 * Generate the user-facing `index.ts` wrapper content.
 *
 * Kept for backward compatibility with `generateReactorFile`, which still
 * emits the standalone `index.generated.ts` shape. New pipeline code uses
 * `generateEntryFile` (from `./declarations.js`), which re-exports
 * `./generated`.
 */
export function generateReactorEntryFile(): string {
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
