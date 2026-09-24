/**
 * Output directories that two configured entries share.
 *
 * The pipeline's `.ic-reactor-owner` marker stops a second canister from
 * generating over the first one, but it records the canister name. Two entries
 * with the same `name` both resolve to `<outDir>/<name>` and pass that check.
 * Copying an entry and changing only its key or `mode` produces that config,
 * and the later entry then replaced the earlier one's output on every run. The
 * vite plugin starts every entry at once, so which one won changed from run to
 * run.
 *
 * The CLI and the vite plugin both run this check over every configured entry
 * before they generate one, and fail the later entry with
 * {@link sharedOutDirMessage}.
 */

import fs from "node:fs"
import path from "node:path"
import type { CanisterConfig } from "./types.js"
import {
  assertContainedPath,
  assertSafeCanisterName,
  CodegenConfigError,
  resolveContainedOutDir,
} from "./validate.js"

/**
 * Find the entries that generate into a directory an earlier entry already
 * uses.
 *
 * The check compares directories by where they really are on disk, so a
 * symlink to another entry's directory, or a spelling of it that differs only
 * in case, counts as the same directory. Both show only once the directory
 * exists. A caller that generates its entries one after another should run the
 * check again before each entry, since an earlier entry can create the
 * directory that a later one reaches that way.
 *
 * @param canisters - Each entry's key and config, in config order. The first
 * entry to use a directory keeps it. A key listed twice is one entry.
 * @param globalOutDir - The global `outDir`. An entry without its own `outDir`
 * generates into `<globalOutDir>/<name>`.
 * @param projectRoot - The directory relative paths resolve against.
 * @returns The key of each later entry, mapped to the key of the first entry
 * that uses its directory. An entry whose `name` or `outDir` the pipeline
 * rejects is left out, since the pipeline reports that error itself.
 */
export function findSharedOutDirs<K>(
  canisters: Iterable<readonly [key: K, canister: CanisterConfig]>,
  globalOutDir: string,
  projectRoot: string
): Map<K, K> {
  const firstByOutDir = new Map<string, K>()
  const shared = new Map<K, K>()

  for (const [key, canister] of canisters) {
    const outDir = resolveOutDir(canister, globalOutDir, projectRoot)
    if (outDir === undefined) continue

    const realOutDir = realpathAllowingMissing(outDir)
    const first = firstByOutDir.get(realOutDir)
    if (first === undefined) {
      firstByOutDir.set(realOutDir, key)
    } else if (first !== key) {
      shared.set(key, first)
    }
  }

  return shared
}

/**
 * The error for an entry that {@link findSharedOutDirs} reports, worded the
 * same for the CLI and the vite plugin.
 *
 * @param entry - The entry that must not generate, such as `backend` for the
 * key of an `ic-reactor.json` entry.
 * @param firstEntry - The entry that keeps the directory, such as
 * `canister "ledger"`.
 */
export function sharedOutDirMessage(entry: string, firstEntry: string): string {
  return (
    `${entry}: generates into the same output directory as ${firstEntry}. ` +
    `Each run replaces that directory's declarations and index.generated.ts, ` +
    `so the two would overwrite each other. Give each canister its own ` +
    `"outDir", or its own "name" if it uses the global outDir.`
  )
}

/**
 * The directory the pipeline generates a canister into, or `undefined` when the
 * pipeline rejects the fields that decide it.
 *
 * Only `name`, the canister's own `outDir`, the global `outDir` and the project
 * root decide the directory, so this reads nothing else and applies the checks
 * `assertSafeCanisterConfig` runs on those fields. An error in another field,
 * such as a URL in `clientManagerPath`, fails that canister's own run. Its
 * earlier output still sits in the directory, so the error must not hide the
 * directory from the overlap check.
 */
function resolveOutDir(
  canister: CanisterConfig,
  globalOutDir: string,
  projectRoot: string
): string | undefined {
  const { name } = canister

  try {
    assertSafeCanisterName(name)

    const outDir =
      canister.outDir != null
        ? resolveContainedOutDir("outDir", canister.outDir, projectRoot)
        : path.join(
            resolveContainedOutDir("outDir", globalOutDir, projectRoot),
            name
          )

    assertContainedPath("output directory", outDir, projectRoot)
    return outDir
  } catch (error) {
    if (error instanceof CodegenConfigError) return undefined
    throw error
  }
}

/**
 * Resolve a directory to its real location on disk, so two paths to the same
 * directory compare equal.
 *
 * The directory often does not exist yet, so this resolves the longest part of
 * the path that does and appends the rest unchanged. It calls
 * `fs.realpathSync.native`, which follows symlinks and, on a case-insensitive
 * macOS volume, returns each existing part in the case stored on disk.
 * `fs.realpathSync` keeps the case the caller wrote. The appended parts keep
 * the case the config wrote, so two different directories on a case-sensitive
 * volume never match.
 */
function realpathAllowingMissing(target: string): string {
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
