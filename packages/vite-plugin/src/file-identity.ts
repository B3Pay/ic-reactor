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

/**
 * A key that is equal for two paths exactly when they name the same file,
 * whether or not the file exists yet.
 *
 * - The part of `file` that exists is resolved with `fs.realpathSync.native`,
 *   which follows every symlink and, on macOS and Windows, returns the case
 *   the names have on disk.
 * - The part that does not exist yet (a `didFile` the plugin is about to
 *   write, and the directories it will make for it) is joined to that as it
 *   is spelled.
 * - Where the filesystem of the deepest existing directory ignores case, the
 *   whole key is lowercased, so that a name spelled in another case, which
 *   `realpath` cannot correct while the file does not exist, still gives the
 *   key of the file it will be. The key of a file is then the same before and
 *   after the plugin writes it.
 *
 * Never throws: a path no part of which resolves is its own key.
 */
export function fileIdentity(file: string, folds: FoldsCase): string {
  const absolute = path.resolve(file)
  const missing: string[] = []
  let at = absolute
  for (;;) {
    let real: string | undefined
    try {
      real = fs.realpathSync.native(at)
    } catch {
      real = undefined
    }
    if (real !== undefined) {
      const key = missing.length === 0 ? real : path.join(real, ...missing)
      // The directory the next name is looked up in: the file's own when it
      // exists, the deepest existing one otherwise.
      const dir = missing.length === 0 ? path.dirname(real) : real
      return folds(dir) === true ? key.toLowerCase() : key
    }
    const parent = path.dirname(at)
    if (parent === at) return absolute
    missing.unshift(path.basename(at))
    at = parent
  }
}

/** `folds`, asked once for each directory. */
export function cachedFoldsCase(folds: FoldsCase): FoldsCase {
  const answers = new Map<string, boolean | undefined>()
  return (dir) => {
    if (!answers.has(dir)) answers.set(dir, folds(dir))
    return answers.get(dir)
  }
}
