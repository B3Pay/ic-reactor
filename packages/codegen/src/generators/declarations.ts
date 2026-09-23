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
 *
 * When Prettier resolves from `projectRoot`, it formats the `.js` and `.d.ts`.
 * See `formatGenerated`.
 */

import { didToJs, didToTs } from "@ic-reactor/parser"
import { createRequire } from "node:module"
import path from "node:path"
import fs from "node:fs"
import { pathToFileURL } from "node:url"
import type { GeneratorResult } from "../types.js"
import { CodegenConfigError, resolveDeclarationsBaseName } from "../validate.js"
import { replaceFile } from "../write.js"

export interface DeclarationsGeneratorOptions {
  /** Absolute path to the .did file */
  didFile: string
  /** Absolute path to the output directory (declarations/ will be created inside) */
  outDir: string
  /** Canister name (used only for error messages) */
  canisterName: string
  /**
   * Project whose Prettier formats the generated `.js` and `.d.ts`, using the
   * config it resolves for each file's final path. When this is omitted, or no
   * Prettier resolves from it, the generator writes the parser's output
   * followed by a newline.
   */
  projectRoot?: string
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

  // Same parent as `to`, so this is a rename within one filesystem. Dot-prefixed
  // because a crash between the two renames below strands this directory next
  // to the real one: `declarations.old-XYZ` sits inside the project's source
  // tree and TypeScript would compile it, producing duplicate declarations on
  // top of whatever the crash already caused.
  const displaced = fs.mkdtempSync(
    path.join(path.dirname(to), `.${path.basename(to)}.old-`)
  )
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

/** The part of Prettier's API used here, in the shape v2 and v3 share. */
export interface Prettier {
  format(
    source: string,
    options: Record<string, unknown>
  ): string | Promise<string>
  resolveConfig(
    filePath: string,
    options: Record<string, unknown>
  ): Promise<Record<string, unknown> | null>
}

/**
 * Load the Prettier installed in the project at `projectRoot`, if any.
 *
 * Resolving it from the project, instead of bundling Prettier or declaring it
 * as a dependency, means the install that runs the project's own
 * `prettier --check` is the one that formats the output.
 */
export async function loadPrettier(
  projectRoot: string
): Promise<Prettier | undefined> {
  try {
    // createRequire needs a file to resolve relative to; it need not exist.
    const entry = createRequire(path.resolve(projectRoot, "noop.js")).resolve(
      "prettier"
    )
    const loaded = (await import(pathToFileURL(entry).href)) as {
      default?: Prettier
    } & Partial<Prettier>
    // Prettier 3's CommonJS entry comes back with its API under `default` only.
    const api = typeof loaded.format === "function" ? loaded : loaded.default
    return typeof api?.format === "function" &&
      typeof api.resolveConfig === "function"
      ? (api as Prettier)
      : undefined
  } catch {
    return undefined
  }
}

/**
 * Resolve the config's plugin package names from the project.
 *
 * `resolveConfig` makes a relative plugin path absolute against the config file
 * but leaves a package name as written, and `format` then imports that name
 * from `process.cwd()`. Vite started from a monorepo root with `root` pointing
 * at a nested app has its working directory at the monorepo root, where the
 * app's plugins may not be installed, and formatting failed. A name that does
 * not resolve from the project is left for Prettier to try.
 */
function resolvePluginNames(
  plugins: unknown[],
  projectRoot: string
): unknown[] {
  const require = createRequire(path.resolve(projectRoot, "noop.js"))
  return plugins.map((plugin) => {
    if (
      typeof plugin !== "string" ||
      plugin.startsWith(".") ||
      path.isAbsolute(plugin)
    ) {
      return plugin
    }
    try {
      return require.resolve(plugin)
    } catch {
      return plugin
    }
  })
}

/**
 * Format one generated file with the options `prettier --check` would apply.
 *
 * The config is resolved for `finalPath`, where the file ends up, and not for
 * the staging directory it is first written to. `overrides` keyed on the output
 * location only match the final path.
 *
 * Any failure returns the parser's output instead, whether the config does not
 * parse or names a plugin that is not installed. Generation has to work without
 * Prettier, and in watch mode a formatting error would break the rebuild.
 *
 * Either way the result ends in a newline. The parser emits none.
 */
export async function formatGenerated(
  prettier: Prettier | undefined,
  projectRoot: string | undefined,
  source: string,
  finalPath: string,
  parser: "babel" | "typescript"
): Promise<string> {
  let output = source
  if (prettier && projectRoot) {
    try {
      const config = await prettier.resolveConfig(finalPath, {
        // What the Prettier CLI does by default.
        editorconfig: true,
        // A long-lived dev server would otherwise keep formatting with a
        // config the user has since edited.
        useCache: false,
      })
      const options: Record<string, unknown> = {
        ...config,
        // Set after the config. The generated file's language is known, and a
        // project-wide `parser` such as "babel" would fail on the .d.ts.
        parser,
        filepath: finalPath,
      }
      if (Array.isArray(options.plugins)) {
        options.plugins = resolvePluginNames(options.plugins, projectRoot)
      }
      output = await prettier.format(source, options)
    } catch {
      // Keep the parser's output, as above.
    }
  }
  return output.endsWith("\n") ? output : `${output}\n`
}

/**
 * The export the generated reactor imports. Its presence in `didToJs` output is
 * the authoritative "this .did describes a service" test — see the note in
 * generateDeclarations.
 */
const HAS_IDL_FACTORY = /\bexport\s+const\s+idlFactory\b/

/**
 * Marker naming the canister an output directory belongs to. Dot-prefixed so
 * it stays out of the generated surface consumers import.
 */
export const OWNER_FILE = ".ic-reactor-owner"

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
 *
 * The parser emits candid's house style. Committed declarations are usually
 * formatted, so writing that style back turned every regeneration into a diff.
 */
export async function generateDeclarations(
  options: DeclarationsGeneratorOptions
): Promise<DeclarationsGeneratorResult> {
  const { didFile, outDir, canisterName, projectRoot } = options

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

    const jsContent = didToJs(didContent)
    const tsContent = didToTs(didContent)

    // A .did that parses but declares no service is a normal thing to have — a
    // shared types file, say — but it compiles to a module with no `idlFactory`
    // and no `_SERVICE`, which is exactly what the generated reactor imports.
    // Caught here the caller gets the .did path; not caught, the consumer's
    // build fails on a file we just reported as generated.
    //
    // The test is on the GENERATED OUTPUT, not on `parseDid(...).service`. That
    // AST field is only populated for an inline body; it is null for every
    // alias form — `service : S;`, `service : (args) -> S;`, `service name : S;`
    // — which the parser nonetheless compiles to a complete idlFactory. Gating
    // on the AST field rejected those valid files outright.
    if (!HAS_IDL_FACTORY.test(jsContent)) {
      return {
        success: false,
        declarationsDir,
        files: [],
        error:
          `[${canisterName}] ${didFile} produces no idlFactory, so there is no service ` +
          `to generate against. Point this canister at the .did file that declares its ` +
          `service.`,
      }
    }

    const jsPath = path.join(declarationsDir, `${baseName}.js`)
    const dtsPath = path.join(declarationsDir, `${baseName}.d.ts`)
    const didCopyPath = path.join(declarationsDir, `${baseName}.did`)

    // Ensure output dir exists — it is also the staging directory's parent, so
    // the swap below stays a same-filesystem rename.
    fs.mkdirSync(outDir, { recursive: true })

    // Record which canister owns this directory. The pipeline reads it to stop
    // a second canister generating into the same outDir and wiping the first
    // one's declarations. It lives here rather than in index.generated.ts
    // because `--bindgen-only` never writes that file, and the declarations
    // replacement it skips past is exactly the destructive step.
    //
    // The write comes before the first await. The pipeline reads the marker
    // and calls this function without yielding, so the check and the claim run
    // as one synchronous step. The vite plugin starts every canister's pipeline
    // at once, and when Prettier loading came first, a second canister read the
    // directory as unowned and generated over the first one.
    //
    // replaceFile is synchronous, so it keeps that property, and it replaces a
    // link at the marker's path instead of writing through it.
    replaceFile(path.join(outDir, OWNER_FILE), `${canisterName}\n`)

    const prettier = projectRoot ? await loadPrettier(projectRoot) : undefined
    const jsOutput = await formatGenerated(
      prettier,
      projectRoot,
      jsContent,
      jsPath,
      "babel"
    )
    const tsOutput = await formatGenerated(
      prettier,
      projectRoot,
      tsContent,
      dtsPath,
      "typescript"
    )

    staging = fs.mkdtempSync(path.join(outDir, ".declarations.tmp-"))

    fs.writeFileSync(path.join(staging, `${baseName}.js`), jsOutput)
    fs.writeFileSync(path.join(staging, `${baseName}.d.ts`), tsOutput)
    // A byte copy of the source, so never formatted.
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
