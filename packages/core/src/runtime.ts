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

/**
 * Node's `process`, as far as it is read here. Declared in this module so
 * that it reads the same with or without Node's types.
 */
declare const process: { readonly env: { readonly NODE_ENV?: string } }

/**
 * Whether development-only warnings are shown: everywhere but a production
 * build. Written as `@ic-reactor/react` writes it, so that a bundler replaces
 * `process.env.NODE_ENV` with its value in a browser build. Without a bundler
 * and without Node, `process` throws, and the warning is shown.
 *
 * Internal: not exported from the package entry.
 */
export const isDevelopment = (): boolean => {
  try {
    return process.env.NODE_ENV !== "production"
  } catch {
    return true
  }
}
