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

import { initCod, generateTypescript } from "@ic-reactor/cod"
import path from "node:path"
import fs from "node:fs"
import type { GeneratorResult } from "../types.js"

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
 * Generate TypeScript declarations from a Candid file.
 *
 * Always cleans and regenerates the declarations directory to ensure
 * it's in sync with the source .did file.
 */
export async function generateDeclarations(
  options: DeclarationsGeneratorOptions
): Promise<DeclarationsGeneratorResult> {
  const { didFile, outDir, canisterName } = options

  if (!fs.existsSync(didFile)) {
    return {
      success: false,
      declarationsDir: "",
      files: [],
      error: `DID file not found: ${didFile}`,
    }
  }

  const declarationsDir = path.join(outDir, "declarations")
  const baseName = path.basename(didFile, ".did") // e.g. "backend" from "backend.did"

  try {
    // Read the DID content before any directory manipulation
    const didContent = fs.readFileSync(didFile, "utf-8")

    // Ensure output dir exists
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true })
    }

    // Clean and recreate declarations dir for a fresh generation
    if (fs.existsSync(declarationsDir)) {
      fs.rmSync(declarationsDir, { recursive: true, force: true })
    }
    fs.mkdirSync(declarationsDir, { recursive: true })

    await initCod()
    const tsContent = generateTypescript(didContent, { canisterName })

    const tsPath = path.join(declarationsDir, `${baseName}.generated.ts`)
    const didCopyPath = path.join(declarationsDir, `${baseName}.did`)

    fs.writeFileSync(tsPath, tsContent)
    fs.writeFileSync(didCopyPath, didContent)

    return {
      success: true,
      declarationsDir,
      files: [
        { success: true, filePath: tsPath },
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
  }
}

/**
 * Check if declarations already exist for a canister.
 */
export function declarationsExist(
  outDir: string,
  canisterName: string
): boolean {
  const tsPath = path.join(
    outDir,
    "declarations",
    `${canisterName}.generated.ts`
  )
  return fs.existsSync(tsPath)
}
