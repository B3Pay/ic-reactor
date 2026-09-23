/**
 * Path comparison helpers.
 */

import fs from "node:fs"
import path from "node:path"

/**
 * Resolve a directory to its real location on disk, so two paths to the same
 * directory compare equal.
 *
 * The directory often does not exist yet, so this resolves the longest part of
 * the path that does and appends the rest unchanged, as codegen's private helper
 * of the same name does. It calls `fs.realpathSync.native`, which follows
 * symlinks and, on a case-insensitive macOS volume, returns each existing part
 * in the case stored on disk. `fs.realpathSync` keeps the case the caller wrote.
 *
 * The appended parts keep the case the config wrote, so two different
 * directories on a case-sensitive volume never match. It also means a
 * difference only in case shows once the directory exists, including a
 * directory an earlier canister created in the same run.
 *
 * `generate` compares output directories with this to find entries that share
 * one, and `--clean` to tell a configured canister's output from stale output.
 */
export function realpathAllowingMissing(target: string): string {
  const missing: string[] = []
  let current = target

  for (;;) {
    try {
      return path.join(fs.realpathSync.native(current), ...missing)
    } catch {
      const parent = path.dirname(current)
      // Reached the filesystem root without finding anything that exists.
      if (parent === current) return target
      missing.unshift(path.basename(current))
      current = parent
    }
  }
}
