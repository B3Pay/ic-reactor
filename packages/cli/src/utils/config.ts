/**
 * Configuration file utilities
 */

import fs from "node:fs"
import path from "node:path"
import type { ReactorConfig } from "../types.js"

export const CONFIG_FILE_NAME = "reactor.config.json"

export const DEFAULT_CONFIG: ReactorConfig = {
  $schema:
    "https://raw.githubusercontent.com/B3Pay/ic-reactor/main/packages/cli/schema.json",
  outDir: "src/canisters",
  canisters: {},
  generatedHooks: {},
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
export function loadConfig(configPath?: string): ReactorConfig | null {
  const filePath = configPath ?? findConfigFile()

  if (!filePath || !fs.existsSync(filePath)) {
    return null
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8")
    return JSON.parse(content) as ReactorConfig
  } catch {
    return null
  }
}

/**
 * Save the reactor config file
 */
export function saveConfig(
  config: ReactorConfig,
  configPath: string = path.join(process.cwd(), CONFIG_FILE_NAME)
): void {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n")
}

/**
 * Get the project root (where package.json is)
 */
export function getProjectRoot(): string {
  let currentDir = process.cwd()

  while (currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(path.join(currentDir, "package.json"))) {
      return currentDir
    }
    currentDir = path.dirname(currentDir)
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

/**
 * Check if a file exists
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath)
}

/**
 * Calculate relative path from one file to another
 */
export function getRelativePath(from: string, to: string): string {
  const relativePath = path.relative(path.dirname(from), to)
  // Ensure it starts with ./ or ../
  if (!relativePath.startsWith(".")) {
    return "./" + relativePath
  }
  return relativePath
}
