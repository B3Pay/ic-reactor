/**
 * Bindgen utilities
 *
 * Generates TypeScript declarations from Candid files using @icp-sdk/bindgen.
 */

import { generate } from "@icp-sdk/bindgen/core"
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
 * - declarations/<canisterName>.did.ts - IDL factory and types
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

  try {
    await generate({
      didFile,
      outDir: declarationsDir,
      output: {
        actor: {
          disabled: true, // We don't need actor creation, we use Reactor
        },
        force: true, // Overwrite existing files
      },
    })

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
  const didTsPath = path.join(declarationsDir, `${canisterName}.did.ts`)
  return fs.existsSync(didTsPath)
}

/**
 * Save a Candid source to a file (for use with fetch command)
 */
export function saveCandidFile(
  candidSource: string,
  outDir: string,
  canisterName: string
): string {
  const candidDir = path.join(outDir, "candid")
  if (!fs.existsSync(candidDir)) {
    fs.mkdirSync(candidDir, { recursive: true })
  }

  const candidPath = path.join(candidDir, `${canisterName}.did`)
  fs.writeFileSync(candidPath, candidSource)
  return candidPath
}
