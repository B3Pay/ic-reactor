/**
 * Bindgen utilities
 *
 * Generates TypeScript declarations from Candid files using @ic-reactor/parser.
 */

import { didToJs, didToTs } from "@ic-reactor/parser"
import path from "node:path"
import fs from "node:fs"

export interface BindgenOptions {
  /** Path to the .did file */
  didFile: string
  /** Output directory for generated declarations */
  outDir: string
  /** Canister name (used for naming) */
  canisterName: string
}

export interface BindgenResult {
  success: boolean
  declarationsDir: string
  error?: string
}

/**
 * Generate TypeScript declarations from a Candid file
 *
 * This creates:
 * - declarations/<canisterName>.js - IDL factory
 * - declarations/<canisterName>.d.ts - Types
 */
export async function generateDeclarations(
  options: BindgenOptions
): Promise<BindgenResult> {
  const { didFile, outDir } = options

  // Ensure the .did file exists
  if (!fs.existsSync(didFile)) {
    return {
      success: false,
      declarationsDir: "",
      error: `DID file not found: ${didFile}`,
    }
  }

  const declarationsDir = path.join(outDir, "declarations")
  const didFileName = path.basename(didFile) // e.g., "my_canister.did"

  try {
    // Read content first so we can safely delete the directory if didFile is inside it
    const didContent = fs.readFileSync(didFile, "utf-8")

    // Ensure the output directory exists
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true })
    }

    // Clean existing declarations before regenerating
    if (fs.existsSync(declarationsDir)) {
      fs.rmSync(declarationsDir, { recursive: true, force: true })
    }
    fs.mkdirSync(declarationsDir, { recursive: true })

    const jsContent = didToJs(didContent)
    const tsContent = didToTs(didContent)

    // Write .did, .js and .d.ts
    const baseName = didFileName.replace(/\.did$/, "")
    const jsPath = path.join(declarationsDir, baseName + ".js")
    const dtsPath = path.join(declarationsDir, baseName + ".d.ts")
    const didPath = path.join(declarationsDir, didFileName)

    fs.writeFileSync(jsPath, jsContent)
    fs.writeFileSync(dtsPath, tsContent)
    fs.writeFileSync(didPath, didContent)

    return {
      success: true,
      declarationsDir,
    }
  } catch (error) {
    return {
      success: false,
      declarationsDir,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Check if declarations already exist for a canister
 */
export function declarationsExist(
  outDir: string,
  canisterName: string
): boolean {
  const declarationsDir = path.join(outDir, "declarations")
  const didTsPath = path.join(declarationsDir, `${canisterName}.d.ts`)
  return fs.existsSync(didTsPath)
}
