/**
 * Config validation for the codegen pipeline.
 *
 * Every value validated here arrives from a project's `ic-reactor.json` or from
 * `@ic-reactor/vite-plugin` options — that is, from a file in a repository the
 * user may have merely cloned. The pipeline turns those values into filesystem
 * paths it recursively deletes and into source text it writes into the user's
 * bundle, so they are treated as untrusted input rather than as configuration.
 *
 * Validation lives here, at the pipeline's own entry point, rather than in the
 * CLI's interactive prompt: the prompt only covers one of the three entry paths
 * (hand-edited config and plugin options bypass it entirely).
 */

import fs from "node:fs"
import path from "node:path"
import type { CodegenTarget, ReactorClassName } from "./types.js"
import {
  getHookPrefix,
  getReactorName,
  getServiceTypeName,
  toPascalCase,
} from "./naming.js"

/**
 * Thrown when a canister config would produce an unsafe path or unsafe
 * generated source. Callers convert this into a `PipelineResult` error.
 */
export class CodegenConfigError extends Error {
  override readonly name = "CodegenConfigError"

  constructor(message: string) {
    super(message)
  }
}

/**
 * Characters allowed in a canister name.
 *
 * A canister name becomes a directory segment, so this excludes path
 * separators, quotes, whitespace and control characters. It deliberately does
 * NOT require a leading letter: `dfx` places no restriction on canister names,
 * and real projects use `_private` and `my.canister`, both of which derive
 * perfectly good identifiers. Identifier validity is enforced separately, on
 * the *derived* names, by {@link assertSafeCanisterName}.
 */
export const CANISTER_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/

/** A valid JavaScript/TypeScript identifier. */
const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/

const MAX_CANISTER_NAME_LENGTH = 64

/** Matches a URI scheme (`https:`, `data:`, `file:`) or a protocol-relative prefix. */
const HAS_URI_SCHEME = /^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)/

/** Characters that would terminate the string literal or import specifier we emit into. */
// eslint-disable-next-line no-control-regex
const BREAKS_OUT_OF_LITERAL = /["'`\\\u0000-\u001f\u2028\u2029]/

/**
 * Assert that a canister name is safe to use as a path segment and as the stem
 * of a generated identifier.
 *
 * Rejecting a leading digit here is what stops `2048_game` from reaching the
 * generator, where it would become `export const 2048GameReactor` — invalid
 * TypeScript emitted with a success status.
 */
export function assertSafeCanisterName(name: unknown): asserts name is string {
  if (typeof name !== "string" || name.length === 0) {
    throw new CodegenConfigError(
      `Invalid canister name: expected a non-empty string, received ${
        name === undefined ? "undefined" : JSON.stringify(name)
      }. Check the "canisters" entries in your ic-reactor.json (or the plugin's "canisters" option).`
    )
  }

  if (name.length > MAX_CANISTER_NAME_LENGTH) {
    throw new CodegenConfigError(
      `Invalid canister name ${JSON.stringify(name)}: must be at most ${MAX_CANISTER_NAME_LENGTH} characters.`
    )
  }

  if (!CANISTER_NAME_PATTERN.test(name)) {
    throw new CodegenConfigError(
      `Invalid canister name ${JSON.stringify(name)}: may contain only letters, digits, ` +
        `"_", "." and "-" (${CANISTER_NAME_PATTERN.source}). Canister names become directory ` +
        `names, so path separators, quotes and whitespace are not allowed.`
    )
  }

  // "." and ".." pass the character rule but are path traversal as segments.
  if (name === "." || name === "..") {
    throw new CodegenConfigError(
      `Invalid canister name ${JSON.stringify(name)}: refers to a directory, not a canister.`
    )
  }

  // The name is also the stem of every generated identifier. Check the derived
  // names rather than the raw one, so dfx-legal names like "_private" and
  // "my.canister" keep working while "2048_game" — which would emit
  // `export const 2048GameReactor` — is caught here instead of by the compiler.
  if (toPascalCase(name).length === 0) {
    throw new CodegenConfigError(
      `Invalid canister name ${JSON.stringify(name)}: contains no letters or digits, so it ` +
        `collapses to an empty identifier in generated code.`
    )
  }

  const derived: Array<[string, string]> = [
    ["reactor constant", getReactorName(name)],
    ["service type", getServiceTypeName(name)],
    ["hook name", `use${getHookPrefix(name)}Query`],
  ]

  for (const [what, identifier] of derived) {
    if (!IDENTIFIER_PATTERN.test(identifier)) {
      throw new CodegenConfigError(
        `Invalid canister name ${JSON.stringify(name)}: it derives the ${what} ` +
          `${JSON.stringify(identifier)}, which is not a valid TypeScript identifier. ` +
          `Rename the canister so it does not begin with a digit.`
      )
    }
  }
}

/**
 * Assert that a module specifier we interpolate into an `import` statement is a
 * relative path or a bare package name — never a URL.
 *
 * A `https://…` specifier here would make the generated module pull code from a
 * remote host at import time, inside the user's own bundle.
 */
export function assertSafeModuleSpecifier(
  label: string,
  specifier: unknown
): asserts specifier is string {
  if (typeof specifier !== "string" || specifier.length === 0) {
    throw new CodegenConfigError(
      `Invalid ${label}: expected a non-empty string, received ${
        specifier === undefined ? "undefined" : JSON.stringify(specifier)
      }.`
    )
  }

  if (BREAKS_OUT_OF_LITERAL.test(specifier)) {
    throw new CodegenConfigError(
      `Invalid ${label} ${JSON.stringify(specifier)}: must not contain quotes, backslashes or control characters.`
    )
  }

  // Surrounding whitespace is stripped when a specifier is parsed as a URL, so
  // " https://evil.example/x.js" would slip past an anchored scheme check and
  // then load as a remote URL anyway. Reject it outright and match the scheme
  // against the trimmed value.
  if (/^\s|\s$/.test(specifier)) {
    throw new CodegenConfigError(
      `Invalid ${label} ${JSON.stringify(specifier)}: must not begin or end with whitespace.`
    )
  }

  if (HAS_URI_SCHEME.test(specifier.trim())) {
    throw new CodegenConfigError(
      `Invalid ${label} ${JSON.stringify(specifier)}: must be a relative path ("./…", "../…") or a ` +
        `bare package name. URLs are not allowed — the generated file imports from this specifier.`
    )
  }
}

/** Reactor classes the generator knows how to emit an import for. */
export const REACTOR_CLASS_NAMES: readonly ReactorClassName[] = [
  "Reactor",
  "DisplayReactor",
  "CandidReactor",
  "CandidDisplayReactor",
  "MetadataDisplayReactor",
]

/** Runtime targets the generator knows how to emit. */
export const CODEGEN_TARGETS: readonly CodegenTarget[] = ["react", "core"]

/**
 * Assert a config value is one of a closed set.
 *
 * `mode` and `target` are interpolated into emitted source as bare identifiers
 * and module specifiers, so an unrecognized value is not merely unsupported —
 * it is injected.
 */
export function assertOneOf<T extends string>(
  label: string,
  value: unknown,
  allowed: readonly T[]
): asserts value is T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new CodegenConfigError(
      `Invalid ${label} ${JSON.stringify(value)}: must be one of ${allowed
        .map((a) => JSON.stringify(a))
        .join(", ")}.`
    )
  }
}

/**
 * Resolve a path to its real location on disk, following symlinks.
 *
 * The target usually does not exist yet (it is about to be generated), so this
 * resolves the deepest ancestor that *does* exist and re-appends the remainder.
 * Without this, containment is purely lexical and a symlink placed inside the
 * project root — which `path.resolve` does not follow — escapes it.
 */
function realpathAllowingMissing(target: string): string {
  let current = path.resolve(target)
  const missing: string[] = []

  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...missing)
    } catch {
      const parent = path.dirname(current)
      // Reached the filesystem root without finding anything that exists.
      if (parent === current) return path.resolve(target)
      missing.unshift(path.basename(current))
      current = parent
    }
  }
}

/**
 * Assert that an already-resolved absolute path lies inside `projectRoot`.
 *
 * Containment is decided on the real on-disk locations: `path.resolve` does not
 * follow symlinks, so a purely lexical comparison can be walked out of via a
 * symlink placed inside the project root.
 *
 * @param original - the path as the user wrote it, for the error message
 */
export function assertContainedPath(
  label: string,
  resolved: string,
  projectRoot: string,
  original: string = resolved
): void {
  const relative = path.relative(
    realpathAllowingMissing(projectRoot),
    realpathAllowingMissing(resolved)
  )

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new CodegenConfigError(
      `Invalid ${label} ${JSON.stringify(original)}: resolves to ${JSON.stringify(resolved)}, ` +
        `which is outside the project root ${JSON.stringify(path.resolve(projectRoot))}. ` +
        `Generated output must stay inside the project — generated directories are deleted and ` +
        `rewritten on every run.`
    )
  }
}

/**
 * Resolve `outDir` against `projectRoot` and assert the result stays inside it.
 *
 * The pipeline recursively deletes `<outDir>/declarations` before every
 * generation, so an `outDir` that escapes the project root turns a config file
 * into an arbitrary-directory delete.
 */
export function resolveContainedOutDir(
  label: string,
  outDir: unknown,
  projectRoot: string
): string {
  if (typeof outDir !== "string" || outDir.length === 0) {
    throw new CodegenConfigError(
      `Invalid ${label}: expected a non-empty string, received ${
        outDir === undefined ? "undefined" : JSON.stringify(outDir)
      }.`
    )
  }

  // The path we hand back is the lexically resolved one, so generated file
  // paths look the way the user wrote them; only the containment decision uses
  // the real on-disk location.
  const resolved = path.isAbsolute(outDir)
    ? path.resolve(outDir)
    : path.resolve(projectRoot, outDir)

  assertContainedPath(label, resolved, projectRoot, outDir)

  return resolved
}

export interface ValidatedCanisterPaths {
  /** The validated canister name. */
  name: string
  /** Absolute output directory, guaranteed to be inside `projectRoot`. */
  outDir: string
  /** Validated module specifier for the client manager import. */
  clientManagerPath: string
}

export interface ValidateCanisterConfigOptions {
  name: unknown
  /** Per-canister `outDir`, if the config sets one. */
  canisterOutDir?: unknown
  /** Global `outDir`; the canister name is appended to it when used. */
  globalOutDir: unknown
  clientManagerPath: unknown
  projectRoot: string
  /** Resolved reactor class (`canisterConfig.mode`), if the config sets one. */
  mode?: unknown
  /** Resolved runtime target (`canisterConfig.target` / global `target`). */
  target?: unknown
}

/**
 * Validate one canister's config and return the resolved, contained paths the
 * pipeline should use.
 *
 * Call this before any filesystem work: it is the single choke point that all
 * three entry paths (CLI, vite plugin, direct API) share.
 */
export function assertSafeCanisterConfig(
  options: ValidateCanisterConfigOptions
): ValidatedCanisterPaths {
  const {
    name,
    canisterOutDir,
    globalOutDir,
    clientManagerPath,
    projectRoot,
    mode,
    target,
  } = options

  assertSafeCanisterName(name)
  assertSafeModuleSpecifier("clientManagerPath", clientManagerPath)

  // `mode` and `target` reach the generator as bare identifiers and as the
  // module specifier they are imported from, so they must be known values.
  if (mode != null) assertOneOf("mode", mode, REACTOR_CLASS_NAMES)
  if (target != null) assertOneOf("target", target, CODEGEN_TARGETS)

  const outDir =
    canisterOutDir != null
      ? resolveContainedOutDir(
          `outDir for canister ${JSON.stringify(name)}`,
          canisterOutDir,
          projectRoot
        )
      : path.join(
          resolveContainedOutDir("outDir", globalOutDir, projectRoot),
          name
        )

  return { name, outDir, clientManagerPath }
}
