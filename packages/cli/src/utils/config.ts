/**
 * Configuration file utilities
 */

import fs from "node:fs"
import path from "node:path"
import { CODEGEN_TARGETS, REACTOR_CLASS_NAMES } from "@ic-reactor/codegen"
import type { CodegenConfig } from "../types.js"
import { CliError, errorMessage } from "./errors.js"

export const CONFIG_FILE_NAME = "ic-reactor.json"

/**
 * A fresh default config.
 *
 * This is a function rather than a shared constant because `canisters` is a
 * mutable map the caller fills in: a single exported object would hand every
 * caller in the process the *same* map, so one `init` would leak its canister
 * into the defaults the next one starts from.
 */
export function createDefaultConfig(): CodegenConfig {
  return {
    $schema:
      "https://raw.githubusercontent.com/B3Pay/ic-reactor/main/packages/cli/schema.json",
    outDir: "src/declarations",
    canisters: {},
  }
}

export interface LoadConfigSuccess {
  config: CodegenConfig
  path: string
}

export interface LoadConfigError {
  path: string
  error: string
}

/**
 * Find the config file in the current directory or parent directories.
 *
 * `generate` uses this to locate the project it belongs to. `init` does not:
 * walking up means the nearest match can be an unrelated ancestor project, and
 * writing there would replace a config that has nothing to do with the cwd.
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
 * Load and validate the reactor config file.
 *
 * @throws {CliError} if the file is unreadable, is not valid JSON, or does not
 * have the shape the codegen pipeline expects.
 */
export function loadConfig(configPath?: string): CodegenConfig | null {
  const filePath = configPath ?? findConfigFile()

  if (!filePath || !fs.existsSync(filePath)) {
    return null
  }

  let content: string
  try {
    content = fs.readFileSync(filePath, "utf-8")
  } catch (error) {
    throw new CliError(
      `Failed to read ${CONFIG_FILE_NAME} at ${filePath}: ${errorMessage(error)}`
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (error) {
    throw new CliError(
      `${CONFIG_FILE_NAME} at ${filePath} is not valid JSON: ${errorMessage(error)}`
    )
  }

  return validateConfig(parsed, filePath)
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
 * Ensure a directory exists
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────
//
// The pipeline validates the *values* it turns into paths and generated source
// (`@ic-reactor/codegen`'s `assertSafeCanisterConfig`). What it cannot do is
// explain a config whose shape is wrong, because by then the wrong shape has
// already crashed something: a `"canister"` typo used to surface as
// `TypeError: Cannot convert undefined or null to object` with a stack into
// bundled dist code, never once naming `ic-reactor.json`. Everything below
// exists to make that failure say which file and which field is wrong.

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** How a wrong value should be described in an error message. */
function describe(value: unknown): string {
  if (value === null) return "null"
  if (Array.isArray(value)) return "an array"
  if (typeof value === "object") return "an object"
  if (typeof value === "string") return `the string ${JSON.stringify(value)}`
  return `${JSON.stringify(value)} (${typeof value})`
}

/** Standard Levenshtein distance. The inputs are object keys, so plain DP. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)

  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    previous = current
  }

  return previous[b.length]
}

/**
 * The key the user probably meant, if one of the keys they did write is close
 * to the missing one.
 *
 * This is what turns the reported `"canister"` typo from a stack trace into a
 * sentence naming both spellings.
 */
function suggestKey(expected: string, present: string[]): string {
  const near = present
    .map((key) => ({ key, distance: editDistance(expected, key) }))
    .filter(({ distance }) => distance > 0 && distance <= 2)
    .sort((a, b) => a.distance - b.distance)[0]

  return near
    ? ` The file has ${JSON.stringify(near.key)} — did you mean it?`
    : ""
}

/**
 * Validate the parsed config against the shape the pipeline requires.
 *
 * Unknown keys are accepted, as the JSON schema accepts them: a project may
 * carry fields for tooling this CLI knows nothing about. Only missing required
 * keys and wrong types are rejected.
 */
export function validateConfig(
  value: unknown,
  filePath: string
): CodegenConfig {
  // A function declaration, not a const arrow: TypeScript only narrows control
  // flow through a never-returning call when the callee is declared this way.
  function fail(problem: string): never {
    throw new CliError(`Invalid ${CONFIG_FILE_NAME} at ${filePath}: ${problem}`)
  }

  function requireString(field: string, raw: unknown, present: string[]): void {
    const key = field.split(".").pop() as string
    if (raw === undefined) {
      fail(
        `${JSON.stringify(field)} is required but missing.${suggestKey(key, present)}`
      )
    }
    if (typeof raw !== "string" || raw.length === 0) {
      fail(
        `${JSON.stringify(field)} must be a non-empty string, found ${describe(raw)}.`
      )
    }
  }

  function optionalString(field: string, raw: unknown): void {
    if (raw === undefined) return
    if (typeof raw !== "string" || raw.length === 0) {
      fail(
        `${JSON.stringify(field)} must be a non-empty string, found ${describe(raw)}.`
      )
    }
  }

  function optionalEnum(
    field: string,
    raw: unknown,
    allowed: readonly string[]
  ): void {
    if (raw === undefined) return
    if (typeof raw !== "string" || !allowed.includes(raw)) {
      fail(
        `${JSON.stringify(field)} must be one of ${allowed
          .map((entry) => JSON.stringify(entry))
          .join(", ")}, found ${describe(raw)}.`
      )
    }
  }

  if (!isPlainObject(value)) {
    fail(`expected a JSON object at the top level, found ${describe(value)}.`)
  }

  const topLevelKeys = Object.keys(value)

  requireString("outDir", value.outDir, topLevelKeys)
  optionalString("clientManagerPath", value.clientManagerPath)
  optionalEnum("target", value.target, CODEGEN_TARGETS)

  const canisters = value.canisters
  if (canisters === undefined) {
    fail(
      `"canisters" is required but missing.${suggestKey("canisters", topLevelKeys)}`
    )
  }
  if (!isPlainObject(canisters)) {
    fail(
      `"canisters" must be an object keyed by canister name, found ${describe(canisters)}.`
    )
  }

  for (const [key, entry] of Object.entries(canisters)) {
    const field = (name: string) => `canisters.${key}.${name}`

    if (!isPlainObject(entry)) {
      fail(
        `${JSON.stringify(`canisters.${key}`)} must be an object, found ${describe(entry)}.`
      )
    }

    const entryKeys = Object.keys(entry)
    requireString(field("name"), entry.name, entryKeys)
    requireString(field("didFile"), entry.didFile, entryKeys)
    optionalString(field("outDir"), entry.outDir)
    optionalString(field("clientManagerPath"), entry.clientManagerPath)
    optionalString(field("canisterId"), entry.canisterId)
    optionalEnum(field("mode"), entry.mode, REACTOR_CLASS_NAMES)
    optionalEnum(field("target"), entry.target, CODEGEN_TARGETS)
  }

  return value as unknown as CodegenConfig
}
