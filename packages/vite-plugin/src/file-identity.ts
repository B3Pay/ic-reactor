/**
 * Which file a path names, whatever its spelling.
 *
 * Two canisters can name one `.did` under different paths: through a
 * symlinked directory (`did/ledger.did` and `shared/ledger.did`), or, where
 * the filesystem ignores case, as `did/Ledger.did` and `did/ledger.did`. The
 * plugin fetches, records and watches a `.did` by the file, so that one file
 * is fetched once and written once, and a conflict between the canisters that
 * name it is seen. See `fetchMissing` in index.ts.
 */

import fs from "node:fs"
import path from "node:path"

/**
 * Whether the filesystem that holds `dir` takes `A.did` and `a.did` for one
 * file, `undefined` when that cannot be told: `foldsCase` of generate.ts, or a
 * cached version of it.
 */
export type FoldsCase = (dir: string) => boolean | undefined

/** Symlinks followed by hand before a path is taken as it is spelled. */
const MAX_LINKS = 40

/**
 * Where `file` really is: the path every spelling of it reads and writes,
 * with `dir`, the existing directory the next name of it is looked up in.
 *
 * - The part of `file` that exists is resolved with `fs.realpathSync.native`,
 *   which follows every symlink and, on macOS and Windows, returns the case
 *   the names have on disk.
 * - A symlink whose target does not exist yet (a `didFile` that links to a
 *   file not written yet, or a directory symlink to a directory not made yet)
 *   is followed to that target, as `writeFile` through it would.
 * - The part that does not exist yet (a `didFile` the plugin is about to
 *   write, and the directories it will make for it) is joined to that as it
 *   is spelled.
 *
 * Never throws: a path no part of which resolves is taken as it is.
 */
function locate(file: string): { real: string; dir: string } {
  const absolute = path.resolve(file)
  const missing: string[] = []
  let at = absolute
  let links = 0
  for (;;) {
    try {
      const real = fs.realpathSync.native(at)
      return missing.length === 0
        ? { real, dir: path.dirname(real) }
        : { real: path.join(real, ...missing), dir: real }
    } catch {
      // Missing, or a symlink whose target is.
    }
    const parent = path.dirname(at)
    if (parent === at) return { real: absolute, dir: path.dirname(absolute) }
    try {
      const target = fs.readlinkSync(at)
      if (links++ < MAX_LINKS) {
        // Relative to the real directory the link is in: `..` in it climbs
        // from there, not from the link's spelling.
        at = path.resolve(fs.realpathSync.native(parent), target)
        continue
      }
    } catch {
      // Not a symlink: a name that does not exist yet.
    }
    missing.unshift(path.basename(at))
    at = parent
  }
}

/**
 * The path `file` is read and written at: through every symlink, so that a
 * write does not replace a symlinked `didFile` with a file of its own and
 * leave its target, which other spellings read, as it was. See `locate`.
 */
export function realFile(file: string): string {
  return locate(file).real
}

/**
 * A key that is equal for two paths exactly when they name the same file,
 * whether or not the file exists yet: where `locate` says the file is.
 *
 * Where the filesystem of the deepest existing directory ignores case, the
 * whole key is lowercased, so that a name spelled in another case, which
 * `realpath` cannot correct while the file does not exist, still gives the
 * key of the file it will be. The key of a file is then the same before and
 * after the plugin writes it.
 *
 * Never throws: a path no part of which resolves is its own key.
 */
export function fileIdentity(file: string, folds: FoldsCase): string {
  const { real, dir } = locate(file)
  return folds(dir) === true ? real.toLowerCase() : real
}

/** `folds`, asked once for each directory. */
export function cachedFoldsCase(folds: FoldsCase): FoldsCase {
  const answers = new Map<string, boolean | undefined>()
  return (dir) => {
    if (!answers.has(dir)) answers.set(dir, folds(dir))
    return answers.get(dir)
  }
}
