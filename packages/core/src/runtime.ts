/**
 * Whether this code runs on a server, as TanStack Query decides it for its
 * default retry count: there is no `window`, or the runtime is Deno, which
 * can define one. The retry predicates follow TanStack's rule so that they
 * never retry where TanStack itself would not, but for one page, below.
 *
 * Deno is known by its `Deno.version.deno`, a string, not by a `Deno` global
 * alone: in a browser an element with `id="Deno"` is one (`window.Deno`,
 * named access), and content a sanitizer keeps can carry that id (#976).
 * Named access only ever yields objects. A cross-origin frame named `Deno`
 * yields its window, whose `version` throws a `SecurityError` when read, so a
 * read that throws is a page too. TanStack reads `"Deno" in globalThis` once,
 * as it loads, so on a page whose own HTML holds such an element TanStack
 * does not retry and these predicates do, as in any browser.
 *
 * Internal: not exported from the package entry.
 */
export const isServer = (): boolean => {
  if (typeof window === "undefined") return true
  try {
    return (
      typeof (globalThis as { Deno?: { version?: { deno?: unknown } } }).Deno
        ?.version?.deno === "string"
    )
  } catch {
    return false
  }
}

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
