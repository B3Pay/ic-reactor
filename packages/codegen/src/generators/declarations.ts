/**
 * Declarations Generator
 *
 * Generates TypeScript declaration files (.js IDL factory + .d.ts types)
 * from a Candid .did file using @ic-reactor/parser.
 *
 * Output structure:
 *   <outDir>/declarations/<name>.js       — IDL factory
 *   <outDir>/declarations/<name>.d.ts     — TypeScript types
 *   <outDir>/declarations/<name>.did      — Copy of the source .did file
 */

import { didToJs, didToTs, parseDid } from "@ic-reactor/parser"
import path from "node:path"
import fs from "node:fs"
import type { GeneratorResult } from "../types.js"
import { CodegenConfigError, resolveDeclarationsBaseName } from "../validate.js"

export interface DeclarationsGeneratorOptions {
  /** Absolute path to the .did file */
  didFile: string
  /** Absolute path to the output directory (declarations/ will be created inside) */
  outDir: string
  /** Canister name (used only for error messages) */
  canisterName: string
}

export interface DeclarationsGeneratorResult {
  success: boolean
  declarationsDir: string
  files: GeneratorResult[]
  error?: string
}

/**
 * Move `from` onto `to`, replacing whatever is already there.
 *
 * `rename(2)` refuses to replace a non-empty directory, so the previous output
 * is moved aside first and only removed once the new directory is in place. If
 * the second rename fails the old directory is put back, so the observable
 * states are "old output" and "new output" — never "no output".
 */
function replaceDirectory(from: string, to: string): void {
  if (!fs.existsSync(to)) {
    fs.renameSync(from, to)
    return
  }

  // Same parent as `to`, so this is a rename within one filesystem.
  const displaced = fs.mkdtempSync(`${to}.old-`)
  // mkdtemp created the directory; rename needs the name to be free.
  fs.rmdirSync(displaced)
  fs.renameSync(to, displaced)

  try {
    fs.renameSync(from, to)
  } catch (error) {
    fs.renameSync(displaced, to)
    throw error
  }

  fs.rmSync(displaced, { recursive: true, force: true })
}

/**
 * Generate TypeScript declarations from a Candid file.
 *
 * Generation happens in a staging directory that is swapped over the existing
 * `declarations/` only after every file has been written. The parser runs on
 * user-authored Candid and throws on a syntax error — under the vite plugin
 * that is a *normal* watch-mode event, one keystroke in a .did file — so
 * deleting the previous output before parsing turned every typo into a broken
 * build with no declarations at all. A failure now leaves the previous
 * declarations byte-identical.
 */
export async function generateDeclarations(
  options: DeclarationsGeneratorOptions
): Promise<DeclarationsGeneratorResult> {
  const { didFile, outDir, canisterName } = options

  const declarationsDir = path.join(outDir, "declarations")

  // Checked before the file itself: an absolute `didFile` ending in ".." is not
  // normalized by the caller and does exist, so without this the diagnostic
  // would be about the file type rather than about the path being a directory.
  let baseName: string
  try {
    baseName = resolveDeclarationsBaseName(didFile)
  } catch (error) {
    if (error instanceof CodegenConfigError) {
      return {
        success: false,
        declarationsDir: "",
        files: [],
        error: `[${canisterName}] ${error.message}`,
      }
    }
    throw error
  }

  let didStat: fs.Stats
  try {
    didStat = fs.statSync(didFile)
  } catch {
    return {
      success: false,
      declarationsDir: "",
      files: [],
      error: `DID file not found: ${didFile}`,
    }
  }

  // A fifo or character device reads forever. Refusing anything that is not a
  // regular file turns an indefinite hang into a diagnosable error.
  if (!didStat.isFile()) {
    return {
      success: false,
      declarationsDir: "",
      files: [],
      error: `[${canisterName}] DID path is not a regular file: ${didFile}`,
    }
  }

  let staging: string | undefined

  try {
    // Read the DID content before any directory manipulation
    const didContent = fs.readFileSync(didFile, "utf-8")

    // A .did that parses but declares no `service` is a normal thing to have —
    // a shared types file, say — but it compiles to a module with no
    // `idlFactory` and no `_SERVICE`, which is exactly what the generated
    // reactor imports. Caught here, the caller gets the .did path; not caught,
    // the consumer's build fails on a file we just reported as generated.
    if (parseDid(didContent).service == null) {
      return {
        success: false,
        declarationsDir,
        files: [],
        error:
          `[${canisterName}] ${didFile} declares no Candid service, so it produces no ` +
          `idlFactory and no _SERVICE to generate against. Point this canister at the ` +
          `.did file that contains its \`service : { … }\` definition.`,
      }
    }

    // Ensure output dir exists — it is also the staging directory's parent, so
    // the swap below stays a same-filesystem rename.
    fs.mkdirSync(outDir, { recursive: true })

    staging = fs.mkdtempSync(path.join(outDir, ".declarations.tmp-"))

    const jsContent = didToJs(didContent)
    const tsContent = didToTs(didContent)

    const jsPath = path.join(declarationsDir, `${baseName}.js`)
    const dtsPath = path.join(declarationsDir, `${baseName}.d.ts`)
    const didCopyPath = path.join(declarationsDir, `${baseName}.did`)

    fs.writeFileSync(path.join(staging, `${baseName}.js`), jsContent)
    fs.writeFileSync(path.join(staging, `${baseName}.d.ts`), tsContent)
    fs.writeFileSync(path.join(staging, `${baseName}.did`), didContent)

    replaceDirectory(staging, declarationsDir)
    staging = undefined

    return {
      success: true,
      declarationsDir,
      files: [
        { success: true, filePath: jsPath },
        { success: true, filePath: dtsPath },
        { success: true, filePath: didCopyPath },
      ],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      declarationsDir,
      files: [],
      error: `[${canisterName}] Failed to generate declarations: ${message}`,
    }
  } finally {
    // Reached on the failure path and on an interrupted swap; a completed swap
    // has already cleared `staging`.
    if (staging) fs.rmSync(staging, { recursive: true, force: true })
  }
}

/**
 * Check if declarations already exist for a canister.
 *
 * Declarations are written under the *.did basename*, which need not equal the
 * canister name — `{ name: "backend", didFile: "service.did" }` writes
 * `declarations/service.d.ts`. Pass `didFile` for an exact answer; without it
 * this falls back to any `.d.ts` in the directory, because a bare
 * `<canisterName>.d.ts` check reports "missing" for perfectly good output.
 */
export function declarationsExist(
  outDir: string,
  canisterName: string,
  didFile?: string
): boolean {
  const declarationsDir = path.join(outDir, "declarations")

  if (didFile !== undefined) {
    const baseName = path.basename(didFile, ".did")
    return fs.existsSync(path.join(declarationsDir, `${baseName}.d.ts`))
  }

  if (fs.existsSync(path.join(declarationsDir, `${canisterName}.d.ts`))) {
    return true
  }

  try {
    return fs
      .readdirSync(declarationsDir)
      .some((entry) => entry.endsWith(".d.ts"))
  } catch {
    return false
  }
}
