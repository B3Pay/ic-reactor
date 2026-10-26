#!/usr/bin/env node
/**
 * Holds the tree to `stack.json`: the candid-core release this branch is
 * tested against, chosen in one place.
 *
 * `stack.json` at the repository root gives the exact stable version of each
 * candid-core package the branch installs (`@candid-core/schema` and
 * `@candid-core/cli`). This script reads every file git tracks and checks
 * every place that names one of those packages with a version:
 *
 * 1. In a `package.json`, a string keyed by the package (a dependency of any
 *    kind, an override, `parent>package` or `package@range` override keys
 *    included) is exactly the manifest's version. A range is another version:
 *    `^0.4.0` fails as `0.3.0` does.
 * 2. In a `package.json` value or a `.md`, `.mdx` or `.txt` file, every
 *    `@candid-core/<name>@<version>`: an install line, a script's `npx`, an
 *    `npm:` alias, a CDN URL. `@^0.3.0`, `@>=0.3.0` and `@latest` fail as
 *    `@0.3.0` does.
 * 3. In a `.md`, `.mdx` or `.txt` file, a line that names the package in
 *    backticks and then says exactly `<version>`, as the docs' peer tables do.
 * 4. The two pins in code, CODE_PINS below.
 *
 * Prose such as "`@candid-core/cli` 0.3.0 reads ..." describes what one
 * release does, so it is left to the person who repins (CONTRIBUTING.md).
 *
 * Other files are not read: a version in a `.ts` or `.yml` file is invisible
 * here unless CODE_PINS names it.
 *
 * Some files keep the versions they have: a changelog (`CHANGELOG.md` or
 * `changelog.mdx`, in any case), which records what each release shipped with;
 * anything under a path of the manifest's `frozen` list (`evals/`, whose
 * conditions pin what they were measured with, and `examples/` between a
 * repin and the release that publishes it); and a symlink, whose target is
 * checked under its own path. Each package of the manifest must also be pinned
 * by at least one `package.json` outside the frozen paths, so an entry nothing
 * installs fails rather than going stale, and each frozen path must hold a
 * tracked file, so a misspelt one fails rather than freezing nothing.
 *
 * A repin edits `stack.json` and runs `pnpm sync:stack` (this script with
 * `--write`), which rewrites in place every pin and mention that disagrees
 * and is a version, a range or a dist-tag. Anything else (`catalog:`,
 * `workspace:*`, a URL) is reported and left for a person, and so is a
 * `package.json` the rewrite would leave unparsable. `pnpm install` then
 * updates the lockfile. CONTRIBUTING.md has the whole repin and the release
 * order around it.
 *
 * Usage:
 *   node scripts/check-stack.mjs            # lists each disagreement, exits 1
 *   node scripts/check-stack.mjs --write    # rewrites them to the manifest
 */
import { execFileSync } from "node:child_process"
import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export const MANIFEST = "stack.json"

/** The manifest's key for the packages it pins. */
const PINS_KEY = "candid-core"

// What `npm install --save-exact` writes for a stable release. A prerelease is
// refused: this branch installs published stable candid-core releases only.
const STABLE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

// npm names are lower case.
const NAME = "@[a-z0-9][a-z0-9._-]*\\/[a-z0-9][a-z0-9._-]*"
const SCOPED_NAME = new RegExp(`^${NAME}$`)

/**
 * Pins written in code rather than a manifest. Each is read by a gate of its
 * own as well (vite-plugin's package test, `check:exports`), but only this
 * script rewrites them in a repin. Each pattern must match exactly once, so a
 * refactor of its file fails here instead of leaving the pin unchecked.
 */
export const CODE_PINS = [
  {
    file: "packages/vite-plugin/src/generate.ts",
    name: "@candid-core/cli",
    pattern: /(export const CANDID_CORE_CLI_VERSION = ")([^"]*)(")/g,
  },
  {
    file: "scripts/export-budget.mjs",
    name: "@candid-core/schema",
    pattern:
      /(package: "@candid-core\/schema",\s*from: "[^"]*",\s*pin: ")([^"]*)(")/g,
  },
]

/** The files whose mentions are read. */
const TEXT_FILE = /\.(?:md|mdx|txt)$/

const CHANGELOG = /(?:^|\/)changelog\.mdx?$/i

/**
 * A version as one token of text: `1.2.3`, `^1.2`, `>=1.2.0`, `1.2.3-beta.1`,
 * `1.x`, `*`, `latest`. A full stop belongs to it only before a word character
 * or `*`, so the full stop that ends a sentence does not, and any other
 * character but a word character, `+` or `-` ends it: a quote, a backtick, a
 * `/`, a backslash, an em dash, `**`.
 */
const TOKEN = "(?:[\\^~]|[<>]=?|=)?(?:\\*|\\w(?:[\\w+-]|\\.[\\w*])*)"

/**
 * What `--write` rewrites: a plain version, a single range or a dist-tag.
 * Anything else that disagrees (`catalog:`, `workspace:*`, `0.4.0.tgz`, two
 * ranges) is reported and left for a person to change.
 */
const REWRITABLE =
  /^(?:(?:[\^~]|[<>]=?|=)?(?:0|[1-9]\d*|[xX*])(?:\.(?:0|[1-9]\d*|[xX*])){0,2}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?|[a-z][a-z0-9-]*)$/

/**
 * A scoped package named with a version: `@scope/name@1.2.3`, `@^1.2`,
 * `@latest`. A `/` may come before it (a CDN URL), a word character, `@`, `.`
 * or `-` may not (`a@scope/name` is not a package).
 */
const NAMED_VERSION = new RegExp(`(?<![\\w@.-])(${NAME})@(${TOKEN})`, "g")

/**
 * The same, in a `package.json` value only: one whose string goes on to end
 * in `":`, such as `"name@1.2.3": ...` or `"name@1.2.3>dep": ...`, is a key,
 * an override's selector.
 */
const NAMED_VERSION_IN_VALUE = new RegExp(
  `${NAMED_VERSION.source}(?![^"\\n]*"\\s*:)`,
  "g"
)

/** A peer-table row: `` `@scope/name` `` | exactly `1.2.3`, on one line. */
const EXACTLY = new RegExp(
  `(\`(${NAME})\`[^\\n\`]*?\\bexactly \`)(${TOKEN})(\`)`,
  "g"
)

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length
}

function parses(text) {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * The manifest, refused unless every version in it is exact and stable.
 *
 * @param {string} repoRoot
 * @returns {{ pins: Map<string, string>, frozen: string[], text: string }}
 */
export function readManifest(repoRoot) {
  const text = readFileSync(join(repoRoot, MANIFEST), "utf8")
  let manifest
  try {
    manifest = JSON.parse(text)
  } catch (error) {
    throw new Error(`${MANIFEST} is not JSON: ${error.message}`)
  }
  if (!isPlainObject(manifest)) {
    throw new Error(`${MANIFEST} must hold an object.`)
  }
  for (const key of Object.keys(manifest)) {
    if (key !== PINS_KEY && key !== "frozen" && !key.startsWith("$")) {
      throw new Error(`${MANIFEST} has an unknown key "${key}".`)
    }
  }
  const entries = isPlainObject(manifest[PINS_KEY])
    ? Object.entries(manifest[PINS_KEY])
    : []
  if (entries.length === 0) {
    throw new Error(
      `${MANIFEST} must name at least one package and its version under "${PINS_KEY}".`
    )
  }
  for (const [name, version] of entries) {
    if (!SCOPED_NAME.test(name)) {
      throw new Error(`${MANIFEST}: "${name}" is not a scoped package name.`)
    }
    if (typeof version !== "string" || !STABLE.test(version)) {
      throw new Error(
        `${MANIFEST}: ${name} must be an exact stable version (MAJOR.MINOR.PATCH), not ${JSON.stringify(version)}.`
      )
    }
  }
  const frozen = manifest.frozen ?? []
  if (
    !Array.isArray(frozen) ||
    frozen.some(
      (entry) =>
        typeof entry !== "string" ||
        entry
          .replace(/\/$/, "")
          .split("/")
          .some((part) => part === "" || part === "." || part === "..")
    )
  ) {
    throw new Error(
      `${MANIFEST}: "frozen" must be a list of paths relative to the repository root, as git lists them (a directory ends in "/").`
    )
  }
  return { pins: new Map(entries), frozen, text }
}

/** Under a `dir/` entry of the frozen list, or a file it names exactly. */
function isFrozen(file, frozen) {
  return frozen.some((entry) =>
    entry.endsWith("/") ? file.startsWith(entry) : file === entry
  )
}

function trackedFiles(repoRoot) {
  return execFileSync("git", ["-C", repoRoot, "ls-files", "-z"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean)
}

/** A tracked regular file's text; null for a symlink or a file deleted since. */
function readTracked(path) {
  try {
    if (lstatSync(path).isSymbolicLink()) return null
  } catch (error) {
    if (error.code === "ENOENT") return null
    throw error
  }
  return readFileSync(path, "utf8")
}

/**
 * Every pin and mention in the tracked tree that disagrees with the manifest.
 * With `write`, each one is rewritten to the manifest's version in place.
 *
 * @param {string} repoRoot
 * @param {{ write?: boolean, codePins?: typeof CODE_PINS }} [options]
 * @returns {{
 *   problems: { file: string, line: number, message: string, fixable: boolean }[],
 *   written: string[],
 *   pins: Map<string, string>,
 *   checked: { pins: number, mentions: number },
 * }}
 */
export function checkStack(
  repoRoot,
  { write = false, codePins = CODE_PINS } = {}
) {
  const { pins, frozen, text: manifestText } = readManifest(repoRoot)
  const problems = []
  const written = []
  const checked = { pins: 0, mentions: 0 }
  const pinnedBy = new Map([...pins.keys()].map((name) => [name, 0]))
  // The key itself, `parent>name` (pnpm and npm overrides) or `name@range`
  // (an override of the versions a range selects). A longer name that starts
  // with this one (`name-extra`) is another package, and so is the `dep` of
  // `name@range>dep`.
  const keyed = [...pins].map(([name]) => ({
    name,
    pattern: new RegExp(
      `("(?:[^"\\\\]*>)?${escapeRegExp(name)}(?:@[^"\\\\>]*)?"\\s*:\\s*")([^"\\\\]*)(")`,
      "g"
    ),
  }))
  const codePinsByFile = new Map(codePins.map((pin) => [pin.file, pin]))
  const seenCodePins = new Set()

  /**
   * Rewrites each match of `pattern` in `source` whose version (capture group
   * `versionGroup`) is not the manifest's, and records a problem for it. A
   * rewrite changes only a version, never a line break, so a line number read
   * from `source` holds for the file as it was read.
   */
  function hold(file, source, pattern, nameOf, versionGroup, rebuild) {
    return source.replace(pattern, (...args) => {
      const match = args[0]
      const groups = args.slice(1, -2)
      const offset = args.at(-2)
      const name = nameOf(groups)
      const expected = pins.get(name)
      if (expected === undefined) return match
      const found = groups.at(versionGroup - 1)
      if (found === expected) return match
      const fixable = REWRITABLE.test(found)
      problems.push({
        file,
        line: lineOf(source, offset),
        message: fixable
          ? `${name} is "${found}"; ${MANIFEST} pins ${expected}`
          : `${name} is "${found}"; ${MANIFEST} pins ${expected}, and only a version, a range or a dist-tag is rewritten, so change this one by hand`,
        fixable,
      })
      return fixable ? rebuild(groups, expected) : match
    })
  }

  /** How many matches of `pattern` in `source` name a package of the manifest. */
  function count(source, pattern, nameOf) {
    return [...source.matchAll(pattern)].filter((match) =>
      pins.has(nameOf(match.slice(1)))
    ).length
  }

  const tracked = trackedFiles(repoRoot)
  for (const entry of frozen) {
    if (tracked.some((file) => isFrozen(file, [entry]))) continue
    problems.push({
      file: MANIFEST,
      line: lineOf(manifestText, manifestText.indexOf(JSON.stringify(entry))),
      message: `the frozen path ${JSON.stringify(entry)} holds no tracked file; a directory ends in "/"`,
      fixable: false,
    })
  }

  for (const file of tracked) {
    const isPackageJson =
      file === "package.json" || file.endsWith("/package.json")
    const isText = TEXT_FILE.test(file) && !CHANGELOG.test(file)
    const codePin = codePinsByFile.get(file)
    if (!isPackageJson && !isText && !codePin) continue
    if (isFrozen(file, frozen)) continue
    const before = readTracked(join(repoRoot, file))
    if (before === null) continue
    let after = before

    if (isPackageJson) {
      for (const { name, pattern } of keyed) {
        const pinned = [...after.matchAll(pattern)].length
        checked.pins += pinned
        pinnedBy.set(name, pinnedBy.get(name) + pinned)
        after = hold(
          file,
          after,
          pattern,
          () => name,
          2,
          ([open, , close], version) => `${open}${version}${close}`
        )
      }
    }
    if (isPackageJson || isText) {
      const named = isPackageJson ? NAMED_VERSION_IN_VALUE : NAMED_VERSION
      checked.mentions += count(after, named, ([name]) => name)
      after = hold(
        file,
        after,
        named,
        ([name]) => name,
        2,
        ([name], version) => `${name}@${version}`
      )
    }
    if (isText) {
      checked.mentions += count(after, EXACTLY, ([, name]) => name)
      after = hold(
        file,
        after,
        EXACTLY,
        ([, name]) => name,
        3,
        ([open, , , close], version) => `${open}${version}${close}`
      )
    }
    if (codePin) {
      seenCodePins.add(codePin)
      const matches = [...after.matchAll(codePin.pattern)].length
      if (matches !== 1) {
        problems.push({
          file,
          line: 0,
          message: `the pin of ${codePin.name} matches ${matches} times, not once; update CODE_PINS in scripts/check-stack.mjs`,
          fixable: false,
        })
      } else {
        checked.pins += 1
        after = hold(
          file,
          after,
          codePin.pattern,
          () => codePin.name,
          2,
          ([open, , close], version) => `${open}${version}${close}`
        )
      }
    }

    if (write && after !== before) {
      if (isPackageJson && !parses(after)) {
        problems.push({
          file,
          line: 0,
          message:
            "the rewrite would leave it invalid JSON, so it is left as it was; change it by hand",
          fixable: false,
        })
        continue
      }
      writeFileSync(join(repoRoot, file), after)
      written.push(file)
    }
  }

  for (const codePin of codePins) {
    if (seenCodePins.has(codePin)) continue
    problems.push({
      file: codePin.file,
      line: 0,
      message: `holds the pin of ${codePin.name} but is not a tracked file; update CODE_PINS in scripts/check-stack.mjs`,
      fixable: false,
    })
  }

  for (const [name, pinned] of pinnedBy) {
    if (pinned > 0) continue
    problems.push({
      file: MANIFEST,
      line: lineOf(manifestText, manifestText.indexOf(`"${name}"`)),
      message: `no package.json outside the frozen paths pins ${name}; remove it from ${MANIFEST} or pin it`,
      fixable: false,
    })
  }

  return { problems, written, pins, checked }
}

function isMain() {
  try {
    return (
      realpathSync(process.argv[1]) ===
      realpathSync(fileURLToPath(import.meta.url))
    )
  } catch {
    return false
  }
}

if (isMain()) {
  const args = process.argv.slice(2)
  const write = args.includes("--write")
  const unknown = args.filter((arg) => arg !== "--write")
  if (unknown.length > 0) {
    console.error(`Unknown argument: ${unknown.join(" ")}`)
    process.exit(2)
  }
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
  let result
  try {
    result = checkStack(repoRoot, { write })
  } catch (error) {
    console.error(`::error::${error.message}`)
    process.exit(1)
  }
  const { problems, written, pins, checked } = result
  const stack = [...pins].map(([name, version]) => `${name} ${version}`)
  const left = write ? problems.filter((problem) => !problem.fixable) : problems
  if (write) {
    for (const file of written) console.log(`rewrote ${file}`)
  }
  for (const { file, line, message } of left) {
    console.error(`${file}:${line}: ${message}`)
  }
  if (left.length > 0) {
    console.error(
      write
        ? `${left.length} problem(s) need a change to ${MANIFEST}, a package.json or scripts/check-stack.mjs.`
        : `${left.length} pin(s) or mention(s) disagree with ${MANIFEST} (${stack.join(", ")}). Run \`pnpm sync:stack\`, then \`pnpm install\`.`
    )
    process.exit(1)
  }
  console.log(
    write
      ? `${written.length} file(s) rewritten to ${stack.join(", ")}. Run \`pnpm install\` to update the lockfile.`
      : `${checked.pins} pins and ${checked.mentions} mentions agree with ${MANIFEST} (${stack.join(", ")}).`
  )
}
