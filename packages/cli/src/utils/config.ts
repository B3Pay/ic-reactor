/**
 * Configuration file utilities
 */

import fs from "node:fs"
import path from "node:path"
import type { CodegenConfig } from "../types.js"

export const CONFIG_FILE_NAME = "ic-reactor.json"

export const DEFAULT_CONFIG: CodegenConfig = {
  $schema:
    "https://raw.githubusercontent.com/B3Pay/ic-reactor/main/packages/cli/schema.json",
  outDir: "src/declarations",
  canisters: {},
}

/**
 * Find the config file in the current directory or parent directories
 */
export function findConfigFile(
  startDir: string = process.cwd()
): string | null {
  let currentDir = startDir

  while (currentDir !== path.dirname(currentDir)) {
    const configPath = path.join(currentDir, CONFIG_FILE_NAME)
    if (fs.existsSync(configPath)) {
      return configPath
    }
    currentDir = path.dirname(currentDir)
  }

  return null
}

/**
 * Load the reactor config file
 */
export function loadConfig(configPath?: string): CodegenConfig | null {
  const filePath = configPath ?? findConfigFile()

  if (!filePath || !fs.existsSync(filePath)) {
    return null
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8")
    return JSON.parse(content) as CodegenConfig
  } catch {
    return null
  }
}

/**
 * Save the reactor config file
 */
export function saveConfig(
  config: CodegenConfig,
  configPath: string = path.join(process.cwd(), CONFIG_FILE_NAME)
): void {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n")
}

/**
 * Get the project root directory.
 */
export function getProjectRoot(): string {
  const configPath = findConfigFile()
  if (configPath) {
    return path.dirname(configPath)
  }
  return process.cwd()
}

/**
 * Ensure a directory exists
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

export function getRelativePath(from: string, to: string): string {
  const relativePath = path.relative(path.dirname(from), to)
  if (!relativePath.startsWith(".")) {
    return "./" + relativePath
  }
  return relativePath
}
