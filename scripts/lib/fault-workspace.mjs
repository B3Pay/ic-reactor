/**
 * What `verify-traps.mjs` and `verify-faults.mjs` share: a throwaway copy of a
 * package to apply a fault to, and the one way a fault is written down.
 *
 * Both scripts prove that a check bites by breaking the code it guards and
 * watching the check fail. Neither may ever touch the working tree while it
 * does: an interrupted run would leave a fault in the source, and a fault left
 * in the source is a bug somebody commits. So the fault goes into a copy under
 * the system temp directory, and the copy is deleted afterwards.
 */
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { basename, isAbsolute, join, relative, resolve } from "node:path"

/** A fault that cannot be applied: its target moved, or it is written wrongly. */
export class FaultError extends Error {
  constructor(message) {
    super(message)
    this.name = "FaultError"
  }
}

/**
 * One textual edit of a fault: `search` becomes `replace` in `file`, a path
 * relative to the package the fault is applied to.
 *
 * @typedef {object} Edit
 * @property {string} file
 * @property {string} search
 * @property {string} replace
 * @property {boolean} [all] Replace every occurrence. By default `search` must
 *   occur exactly once.
 */

/** How many times `search` occurs in `text`, without overlap. */
function occurrences(text, search) {
  let count = 0
  for (
    let at = text.indexOf(search);
    at !== -1;
    at = text.indexOf(search, at + search.length)
  ) {
    count++
  }
  return count
}

/**
 * Applies edits under `root`.
 *
 * Each `search` must occur exactly once (unless the edit says `all`), so a
 * fault that no longer finds its target, or finds it twice, fails loudly
 * instead of silently doing nothing: a fault that changes nothing would make
 * every check look as if it bit.
 *
 * @param {string} root The directory the edits' `file` paths are relative to.
 * @param {Edit[]} edits
 * @param {string} label The fault's name, for messages.
 */
export function applyEdits(root, edits, label) {
  if (!Array.isArray(edits) || edits.length === 0) {
    throw new FaultError(`${label}: the fault has no edits`)
  }
  for (const edit of edits) {
    const { file, search, replace } = edit
    if (
      typeof file !== "string" ||
      typeof search !== "string" ||
      typeof replace !== "string"
    ) {
      throw new FaultError(
        `${label}: an edit needs string "file", "search" and "replace" fields`
      )
    }
    if (search === "" || search === replace) {
      throw new FaultError(
        `${label}: an edit of ${file} must search for something and replace it with something else`
      )
    }
    const path = resolve(root, file)
    const rel = relative(root, path)
    if (rel.startsWith("..") || isAbsolute(rel)) {
      throw new FaultError(`${label}: ${file} is outside the package`)
    }
    if (!existsSync(path)) {
      throw new FaultError(`${label}: ${file} does not exist`)
    }
    const text = readFileSync(path, "utf8")
    const count = occurrences(text, search)
    const shown = JSON.stringify(
      search.length > 70 ? `${search.slice(0, 70)}...` : search
    )
    if (count === 0) {
      throw new FaultError(
        `${label}: ${file} no longer contains ${shown}. The source moved on; update the fault.`
      )
    }
    if (count > 1 && edit.all !== true) {
      throw new FaultError(
        `${label}: ${file} contains ${shown} ${count} times; make the search longer so it names one place`
      )
    }
    writeFileSync(path, text.split(search).join(replace))
  }
}

/** Directories and files a copy leaves out: built or installed, never read. */
const SKIPPED = new Set(["node_modules", "dist", ".vitest", "coverage"])

/**
 * What a tool writes into a `node_modules` it runs next to: Vite's cache
 * (`.vite`, where vitest keeps its results), the bundled config it loads
 * (`.vite-temp`), and the like. They are not linked into a copy's installs,
 * so the tool creates them in the copy.
 */
const TOOL_STATE = /^\.(?:vite|vitest|cache)/

/**
 * A `node_modules` in `target` that holds everything the installs at `source`
 * hold, entry by entry, except what a tool writes there. Linking the whole
 * directory would let vitest write its cache and its bundled config into the
 * repository's installs, up to eight runs at once, from a script that promises
 * to leave the working tree alone.
 *
 * @param {string} source The installs to mirror.
 * @param {string} target Where the mirror goes; created here.
 * @param {(target: string, path: string) => void} link Makes (and records)
 *   one symlink, so `cleanup` can unlink it before anything is deleted.
 */
function linkInstalls(source, target, link) {
  const real = realpathSync(source)
  mkdirSync(target)
  for (const name of readdirSync(real)) {
    if (!TOOL_STATE.test(name)) link(join(real, name), join(target, name))
  }
}

/**
 * A copy of `packageDir` (relative to `repoRoot`, such as `packages/core`)
 * in a fresh temporary directory laid out like the repository: the package at
 * the same relative path and the root's `tsconfig.base.json` above it, so the
 * package's `extends` still resolves. Its `node_modules` (and the root's) is
 * linked entry by entry, not copied, so imports resolve exactly as in the
 * repository while whatever a tool writes beside them (vitest's cache) lands
 * in the copy.
 *
 * @returns {{ root: string, dir: string, cleanup: () => void }} `dir` is the
 * copy of the package; call `cleanup` when done.
 */
export function createWorkspaceCopy({ repoRoot, packageDir }) {
  // The real path: a temporary directory can sit behind a symlink
  // (/var -> /private/var on macOS), and tools name files by their real paths.
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ic-reactor-fault-")))
  const links = []
  const link = (target, path) => {
    symlinkSync(target, path, "dir")
    links.push(path)
  }
  try {
    const base = join(repoRoot, "tsconfig.base.json")
    if (existsSync(base)) cpSync(base, join(root, "tsconfig.base.json"))
    const dir = join(root, packageDir)
    cpSync(join(repoRoot, packageDir), dir, {
      recursive: true,
      filter: (source) =>
        !SKIPPED.has(basename(source)) && !source.endsWith(".tsbuildinfo"),
    })
    const modules = join(repoRoot, packageDir, "node_modules")
    if (existsSync(modules)) {
      linkInstalls(modules, join(dir, "node_modules"), link)
    }
    const rootModules = join(repoRoot, "node_modules")
    if (existsSync(rootModules)) {
      linkInstalls(rootModules, join(root, "node_modules"), link)
    }
    return {
      root,
      dir,
      cleanup() {
        // Unlink the links first: whatever happens after, a recursive delete
        // must never reach through one into the repository's installs.
        for (const path of links) {
          try {
            if (lstatSync(path).isSymbolicLink()) unlinkSync(path)
          } catch {
            // Already gone.
          }
        }
        rmSync(root, { recursive: true, force: true })
      },
    }
  } catch (error) {
    for (const path of links) unlinkSync(path)
    rmSync(root, { recursive: true, force: true })
    throw error
  }
}
