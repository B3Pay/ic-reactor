/**
 * Factories File Generator
 *
 * Generates the managed `index.factories.generated.ts` for a canister whose
 * config sets `factories: true`: one query or mutation object per method,
 * bound to the reactor `index.generated.ts` exports.
 *
 * Generated output example (for canister "backend"):
 *
 *   import { createMutation, createQuery } from "@ic-reactor/react"
 *   import { backendReactor } from "./index.generated"
 *
 *   export const getMessageQuery = createQuery(backendReactor, {
 *     functionName: "get_message",
 *   })
 *
 *   export const setMessageMutation = createMutation(backendReactor, {
 *     functionName: "set_message",
 *   })
 */

import {
  assignFactoryExportNames,
  getReactorName,
  getServiceTypeName,
  isQueryMethod,
  toPascalCase,
} from "../naming.js"
import type { FactoryMethod, ReactorClassName } from "../types.js"
import { getExplicitTransform } from "./reactor.js"

/**
 * The managed file this generator's output is written to, next to
 * `index.generated.ts` in the canister's output directory.
 *
 * @example
 * path.join(canisterOutDir, FACTORIES_FILE_NAME)
 * // "src/declarations/backend/index.factories.generated.ts"
 */
export const FACTORIES_FILE_NAME = "index.factories.generated.ts"

/**
 * Options for {@link generateFactoriesFile}.
 *
 * @example
 * const options: FactoriesGeneratorOptions = {
 *   canisterName: "backend",
 *   methods: [{ name: "get_message", mode: "query", args: [] }],
 *   reactorClass: "Reactor",
 * }
 */
export interface FactoriesGeneratorOptions {
  /** Canister name (e.g. "backend") */
  canisterName: string
  /**
   * The service's methods, such as `parseDid(source).service.methods` from
   * `@ic-reactor/parser`.
   */
  methods: readonly FactoryMethod[]
  /**
   * The reactor class `index.generated.ts` builds, so the factories are typed
   * by its transform. Default: "DisplayReactor"
   */
  reactorClass?: ReactorClassName
}

/** The factory each kind of method gets. */
type FactoryFunction = "createQuery" | "createQueryFactory" | "createMutation"

function getFactoryFunction(method: FactoryMethod): FactoryFunction {
  if (!isQueryMethod(method)) return "createMutation"
  return method.args.length === 0 ? "createQuery" : "createQueryFactory"
}

/** What the doc comment above each export says the method is. */
function describeMethod(method: FactoryMethod, exportName: string): string {
  switch (method.mode) {
    case "query":
    case "composite_query": {
      const kind = method.mode === "query" ? "query" : "composite query"
      return method.args.length === 0
        ? `${kind}, no arguments.`
        : `${kind}. \`${exportName}(args)\` is the query for those arguments.`
    }
    case "oneway":
      return "oneway update."
    default:
      return "update."
  }
}

/**
 * A method name as a string literal inside a block comment. A `*` followed by
 * `/` in the name would otherwise end the comment and turn the rest of the
 * name into source.
 */
function commentLiteral(name: string): string {
  return JSON.stringify(name).replace(/\*\//g, "*\\/")
}

/**
 * Generate the content of a canister's managed factories file.
 *
 * Each method's factory is exported under the name
 * {@link getFactoryExportNames} gives it. A query or composite_query method
 * that takes no arguments gets `createQuery`, one that takes arguments gets
 * `createQueryFactory`, and an update or oneway method gets `createMutation`.
 * Only the factories the file calls are imported, so it compiles under
 * `noUnusedLocals`.
 *
 * @example
 * generateFactoriesFile({
 *   canisterName: "backend",
 *   methods: parseDid(didSource).service?.methods ?? [],
 *   reactorClass: "DisplayReactor",
 * })
 */
export function generateFactoriesFile(
  options: FactoriesGeneratorOptions
): string {
  const { canisterName, methods, reactorClass = "DisplayReactor" } = options

  const pascalName = toPascalCase(canisterName)
  const reactorName = getReactorName(canisterName)
  const serviceName = getServiceTypeName(canisterName)
  // Validates `reactorClass` as well, so an unknown class throws here rather
  // than reaching the output.
  const transform = getExplicitTransform(reactorClass)

  const entries = assignFactoryExportNames(canisterName, methods).map(
    ({ method, exportName }) => ({
      method,
      exportName,
      factory: getFactoryFunction(method),
    })
  )

  const used = new Set(entries.map(({ factory }) => factory))
  const exportNames = new Set(entries.map(({ exportName }) => exportName))
  // A factory is imported under its own name unless a method's export takes
  // that name, as `createQuery` does for a query method named `create`. The
  // alias begins with `_` and a letter, which no export name does.
  const local = (factory: FactoryFunction) =>
    exportNames.has(factory) ? `_${factory}` : factory
  const factoryImports = (
    ["createMutation", "createQuery", "createQueryFactory"] as const
  )
    .filter((factory) => used.has(factory))
    .map((factory) =>
      local(factory) === factory ? factory : `${factory} as ${local(factory)}`
    )

  const imports =
    entries.length === 0
      ? ""
      : `import { ${factoryImports.join(", ")} } from "@ic-reactor/react"
import { ${reactorName}${transform === undefined ? "" : `, type ${serviceName}`} } from "./index.generated"

`

  // Every interpolated method name is JSON.stringify'd: it comes from the
  // .did, which can name a method with any text.
  const body = entries
    .map(({ method, exportName, factory }) => {
      const typeArguments =
        transform === undefined
          ? ""
          : `<${serviceName}, ${JSON.stringify(transform)}, ${JSON.stringify(method.name)}>`
      return `/** ${commentLiteral(method.name)}: ${describeMethod(method, exportName)} */
export const ${exportName} = ${local(factory)}${typeArguments}(${reactorName}, {
  functionName: ${JSON.stringify(method.name)},
})
`
    })
    .join("\n")

  return `${imports}/**
 * ${pascalName} Query and Mutation Factories
 *
 * Auto-generated by @ic-reactor/codegen — do not edit.
 * This file is overwritten whenever generation runs.
 *
 * One export per method of the service, bound to \`${reactorName}\`:
 * \`createQuery\` for a query method that takes no arguments,
 * \`createQueryFactory\` for a query method that takes arguments, and
 * \`createMutation\` for an update or oneway method. Pass per-call options to
 * \`useQuery()\` and \`useMutation()\`, and define a factory with its own
 * config in the stable \`index.ts\` wrapper (or an adjacent module).
 */
${body === "" ? "export {}\n" : `\n${body}`}`
}
