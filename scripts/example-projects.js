/**
 * Shared discovery of the workspace's example projects.
 *
 * Both `typecheck-examples.js` and `build-examples.js` need the same answer to
 * "which directories under examples/ are actual projects?", and that answer has
 * a couple of non-obvious rules baked into it (see `discoverExampleDirs`). They
 * live here so the two scripts cannot drift apart and quietly disagree about
 * what is covered.
 */
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
export const examplesDir = join(root, "examples")

// icp-reactor-demo is a dfx fullstack app whose frontend pins an old vite-plugin,
// so it builds standalone rather than against the local packages. Skip it here.
export const SKIP = new Set(["icp-reactor-demo"])

/**
 * Every example project directory, relative to `examples/`, sorted.
 *
 * Discovery walks tracked files rather than reading the directory, so build
 * output and stray untracked scratch dirs never register as projects.
 *
 * @returns {string[]}
 */
export function discoverExampleDirs() {
  const entries = execFileSync("git", ["-C", examplesDir, "ls-files", "-z"], {
    encoding: "utf8",
  })
  // Discover example projects at BOTH depths, matching pnpm-workspace.yaml's
  // `examples/*` and `examples/*/*`. Keying only on the first path segment used to
  // drop examples/vite-environment-variables entirely -- it has no top-level
  // package.json, so the canonical ic_env injection demo was never type-checked.
  const tracked = entries.split("\0").filter(Boolean)
  return (
    [
      ...new Set(
        tracked.flatMap((p) => {
          const parts = p.split("/")
          const candidates = []
          if (parts.length >= 2) candidates.push(parts[0])
          if (parts.length >= 3) candidates.push(`${parts[0]}/${parts[1]}`)
          return candidates
        })
      ),
    ]
      .filter((name) => existsSync(join(examplesDir, name, "package.json")))
      .filter((name) => !SKIP.has(name.split("/")[0]))
      // A directory that only contains a nested project is a container, not a project.
      .filter((name, _i, all) => {
        const isContainer =
          !name.includes("/") &&
          !existsSync(join(examplesDir, name, "tsconfig.json")) &&
          all.some((other) => other.startsWith(`${name}/`))
        return !isContainer
      })
      .sort()
  )
}
