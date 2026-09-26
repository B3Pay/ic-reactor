/**
 * Whether this code runs on a server, as TanStack Query decides it for its
 * default retry count: there is no `window`, or the runtime is Deno, which
 * can define one. The retry predicates follow TanStack's rule so that they
 * never retry where TanStack itself would not.
 *
 * Internal: not exported from the package entry.
 */
export const isServer = (): boolean =>
  typeof window === "undefined" || "Deno" in globalThis
