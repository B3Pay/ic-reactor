/**
 * A package's public entry points, read from its manifest's `exports` the one
 * way `check-exports.mjs`, `verify-package-artifacts.mjs` and
 * `verify-typescript-floor.js` share.
 */

/**
 * A manifest's `exports` as a map of subpath to target. The sugar forms (a
 * string, an array, or conditions with no subpath keys) are the root subpath;
 * a manifest without `exports` has none, and is read through `types`.
 */
export function exportsMapOf(manifest) {
  const { exports } = manifest
  if (exports === undefined || exports === null) return undefined
  if (
    typeof exports === "string" ||
    Array.isArray(exports) ||
    !Object.keys(exports).some((key) => key.startsWith("."))
  ) {
    return { ".": exports }
  }
  return exports
}

/**
 * The subpaths a consumer can import: each of the `exports` map but
 * `./package.json` and one mapped to `null`, which blocks it. A manifest
 * without `exports` has its root alone.
 */
export function publicSubpaths(manifest) {
  const map = exportsMapOf(manifest)
  if (map === undefined) return ["."]
  return Object.entries(map)
    .filter(
      ([subpath, target]) => subpath !== "./package.json" && target !== null
    )
    .map(([subpath]) => subpath)
}

/** The specifier that imports `subpath` of the package `name`. */
export function specifierOf(name, subpath) {
  return subpath === "." ? name : `${name}/${subpath.replace(/^\.\//, "")}`
}
