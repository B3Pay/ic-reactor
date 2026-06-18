/**
 * @ic-reactor/start — Scaffold writer
 *
 * `createApp` materializes the default V0 app from `templates.ts` onto disk.
 * It is filesystem-only: it does not run installs or generation. The bin and
 * the CLI alias compose this with messaging; tests call it against a temp dir.
 */

import fs from "node:fs"
import path from "node:path"
import {
  buildScaffoldFiles,
  type ScaffoldFile,
  type TemplateContext,
} from "./templates.js"

/**
 * Validate an app name. It must be a valid npm package name segment and a valid
 * directory name. Rejects scoped names, uppercase, and reserved/path chars.
 */
export function isValidAppName(name: string): boolean {
  if (typeof name !== "string") return false
  // Must start with a letter, followed by lowercase letters, digits, or dashes.
  // Scopes are allowed (@scope/name) but the segment after the slash must still
  // start with a letter.
  return /^(?:@[a-z0-9-]+\/)?[a-z][a-z0-9-]*$/.test(name)
}

export interface CreateAppOptions {
  /** Absolute target directory. Created if it does not exist. */
  targetDir: string
  /** App/package name. Defaults to the basename of `targetDir`. */
  appName?: string
  /**
   * Allow writing into a non-empty target directory? Default: `false`.
   * When `false`, a non-empty directory (ignoring `.git`) fails clearly.
   */
  force?: boolean
  /**
   * Optional override of the file list, primarily for testing custom layouts.
   * Defaults to the full V0 template set from `buildScaffoldFiles`.
   */
  files?: ScaffoldFile[]
}

export interface CreateAppResult {
  /** Absolute target directory the app was written to. */
  targetDir: string
  /** App/package name that was used. */
  appName: string
  /** Relative paths of all files written, in order. */
  writtenFiles: string[]
}

/**
 * Files/directories that do not count as "making a directory non-empty" for
 * the purpose of the non-empty guard (e.g. a freshly `git init`-ed folder).
 */
const IGNORED_NON_EMPTY_ENTRIES = new Set([".git", ".DS_Store"])

function isDirSafeToClaim(dir: string, force: boolean): boolean {
  if (!fs.existsSync(dir)) return true
  if (force) return true
  const entries = fs.readdirSync(dir)
  const significant = entries.filter((e) => !IGNORED_NON_EMPTY_ENTRIES.has(e))
  return significant.length === 0
}

function writeFileRecursive(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, "utf8")
}

/**
 * Create a new @ic-reactor/start app on disk.
 *
 * @throws if the app name is invalid, the target is a non-empty directory
 *   without `force`, or a file write fails.
 */
export function createApp(options: CreateAppOptions): CreateAppResult {
  const { targetDir, force = false, files: overrideFiles } = options

  if (!path.isAbsolute(targetDir)) {
    throw new Error(
      `@ic-reactor/start: targetDir must be an absolute path (got "${targetDir}").`
    )
  }

  const appName = options.appName ?? path.basename(targetDir)
  if (!isValidAppName(appName)) {
    throw new Error(
      `@ic-reactor/start: invalid app name "${appName}". ` +
        'Use lowercase letters, digits, and dashes (e.g. "my-app").'
    )
  }

  if (!isDirSafeToClaim(targetDir, force)) {
    throw new Error(
      `@ic-reactor/start: target directory "${targetDir}" is not empty. ` +
        "Move/remove it, or pass `force: true` to overwrite."
    )
  }

  const ctx: TemplateContext = { appName }
  const files = overrideFiles ?? buildScaffoldFiles(ctx)

  const writtenFiles: string[] = []
  for (const file of files) {
    // Guard against path traversal: resolved path must stay within targetDir.
    const resolved = path.resolve(targetDir, file.relativePath)
    const rel = path.relative(targetDir, resolved)
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(
        `@ic-reactor/start: refusing to write outside target directory: ${file.relativePath}`
      )
    }
    writeFileRecursive(resolved, file.content)
    writtenFiles.push(file.relativePath)
  }

  return { targetDir, appName, writtenFiles }
}
