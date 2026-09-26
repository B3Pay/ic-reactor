/**
 * Naming utilities for code generation
 *
 * Pure functions that convert canister/method names to correctly cased
 * identifiers used throughout generated code.
 */

import { camelCase, pascalCase } from "change-case"
import type { FactoryMethod } from "./types.js"

// ─────────────────────────────────────────────────────────────────────────────
// BASE CASE CONVERSIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert string to PascalCase.
 * @example toPascalCase("get_message") → "GetMessage"
 * @example toPascalCase("my-canister") → "MyCanister"
 */
export function toPascalCase(str: string): string {
  return pascalCase(str)
}

/**
 * Convert string to camelCase.
 * @example toCamelCase("get_message") → "getMessage"
 * @example toCamelCase("my-canister") → "myCanister"
 */
export function toCamelCase(str: string): string {
  return camelCase(str)
}

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN-SPECIFIC NAMING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate the reactor variable name for a canister.
 * @example getReactorName("backend") → "backendReactor"
 * @example getReactorName("my_canister") → "myCanisterReactor"
 */
export function getReactorName(canisterName: string): string {
  return `${toCamelCase(canisterName)}Reactor`
}

/**
 * Generate the service type name for a canister.
 * @example getServiceTypeName("backend") → "BackendService"
 * @example getServiceTypeName("my_canister") → "MyCanisterService"
 */
export function getServiceTypeName(canisterName: string): string {
  return `${toPascalCase(canisterName)}Service`
}

/**
 * Generate the hook name prefix (PascalCase canister name).
 * Used when naming the destructured hooks: `use<Prefix>Query`, etc.
 * @example getHookPrefix("my_canister") → "MyCanister"
 */
export function getHookPrefix(canisterName: string): string {
  return toPascalCase(canisterName)
}

/**
 * The hooks a React target's `index.generated.ts` binds, as
 * `[createActorHooks member, suffix of the exported name]`. For canister
 * `backend`, `["useActorQuery", "Query"]` is exported as `useBackendQuery`.
 */
export const ACTOR_HOOK_EXPORTS = [
  ["useActorQuery", "Query"],
  ["useActorSuspenseQuery", "SuspenseQuery"],
  ["useActorInfiniteQuery", "InfiniteQuery"],
  ["useActorSuspenseInfiniteQuery", "SuspenseInfiniteQuery"],
  ["useActorMutation", "Mutation"],
  ["useActorMethod", "Method"],
] as const

// ─────────────────────────────────────────────────────────────────────────────
// FACTORY NAMING
// ─────────────────────────────────────────────────────────────────────────────

/** Whether a method is read with a query call, so it gets a query factory. */
export function isQueryMethod(method: Pick<FactoryMethod, "mode">): boolean {
  return method.mode === "query" || method.mode === "composite_query"
}

/**
 * Compare two method names by their UTF-8 bytes, the order Candid sorts a
 * service's methods in. JavaScript's default sort compares UTF-16 code units,
 * which orders some characters outside the Basic Multilingual Plane
 * differently.
 */
function compareUtf8(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"))
}

/**
 * `methods` sorted as Candid lists them, each with the name its factory is
 * exported under. See {@link getFactoryExportNames} for the rule.
 *
 * @throws {Error} when two methods share a name, which no parsed service has.
 */
export function assignFactoryExportNames<Method extends FactoryMethod>(
  canisterName: string,
  methods: readonly Method[]
): Array<{ method: Method; exportName: string }> {
  // Everything `index.generated.ts` exports. The entry wrapper re-exports it
  // next to the factories, and TypeScript rejects a name both modules export.
  const taken = new Set<string>([
    getReactorName(canisterName),
    getServiceTypeName(canisterName),
    ...ACTOR_HOOK_EXPORTS.map(
      ([, suffix]) => `use${getHookPrefix(canisterName)}${suffix}`
    ),
  ])
  const seen = new Set<string>()

  return [...methods]
    .sort((a, b) => compareUtf8(a.name, b.name))
    .map((method) => {
      if (seen.has(method.name)) {
        throw new Error(
          `Duplicate method name ${JSON.stringify(method.name)}: a service declares each method once.`
        )
      }
      seen.add(method.name)

      // camelCase keeps letters, ASCII digits and `_`. Anything else a case
      // mapping could produce is dropped, so the name is always an identifier.
      let base = toCamelCase(method.name).replace(/[^\p{ID_Continue}]/gu, "")
      if (/^[^\p{ID_Start}$_]/u.test(base)) base = `_${base}`

      let exportName = `${base}${isQueryMethod(method) ? "Query" : "Mutation"}`
      while (taken.has(exportName)) exportName += "_"
      taken.add(exportName)

      return { method, exportName }
    })
}

/**
 * The names `index.factories.generated.ts` exports each method's factory
 * under, keyed by method name and listed in the order Candid lists the
 * methods, which is by name.
 *
 * - A query or composite_query method's factory is `<method>Query`, and an
 *   update or oneway method's is `<method>Mutation`, where `<method>` is the
 *   method name in camelCase as {@link toCamelCase} writes it: `get_message`
 *   gives `getMessageQuery` and `icrc1_transfer` gives `icrc1TransferMutation`.
 *   The suffix keeps names like `if` or `delete` clear of reserved words.
 * - A name that would begin with a digit gets a leading `_`: `"2fa_status"`
 *   gives `_2faStatusQuery`.
 * - Methods take their names in that order. A name that an earlier method
 *   took, or that the canister's `index.generated.ts` exports, gets `_`
 *   appended until it is free, the way the declarations rename a Candid type
 *   that is named like a TypeScript type. So `getThing` and `get_thing` give
 *   `getThingQuery` and `getThingQuery_`, and in canister `backend` a query
 *   method `use_backend` gives `useBackendQuery_`, clear of the hook.
 *
 * @example
 * getFactoryExportNames("backend", [
 *   { name: "get_message", mode: "query", args: [] },
 *   { name: "set_message", mode: "update", args: [{ kind: "text" }] },
 * ])
 * // Map { "get_message" => "getMessageQuery", "set_message" => "setMessageMutation" }
 */
export function getFactoryExportNames(
  canisterName: string,
  methods: readonly FactoryMethod[]
): Map<string, string> {
  return new Map(
    assignFactoryExportNames(canisterName, methods).map(
      ({ method, exportName }) => [method.name, exportName]
    )
  )
}
