#!/usr/bin/env node
/**
 * The export budget gate: the public surface of ic-reactor 4 is the plan in
 * `scripts/export-budget.mjs`, no more.
 *
 * It reads the BUILT declaration entry of `@ic-reactor/core` (`.` and
 * `./testing`), `@ic-reactor/react` and `@ic-reactor/vite-plugin` with the
 * TypeScript compiler API (every name an entry exports, value or type, however
 * it re-exports it), looking the file up in the package's `exports` map as a
 * consumer's TypeScript does, and fails when:
 *
 * - an entry exports a name its budget does not plan;
 * - an entry exports more names than its cap;
 * - a name is exported by two entries (D35);
 * - a name is also exported by `@candid-core/schema` (any of its four entries)
 *   or by TanStack Query (D35: `principal`, `skipToken` and `queryOptions` have
 *   one import path each, and it is never ours);
 * - the installed `@candid-core/schema` is not the pinned version, since its
 *   export list is the reference;
 * - a planned name is not exported, once the version is a beta (while it is an
 *   `-alpha.` prerelease it is reported as pending: the slices that add the
 *   names have not all landed);
 * - a name of an entry's TRANSITIONAL allowance is still exported, once the
 *   version is a beta.
 *
 * Build first: it reads each package's `dist`.
 *
 * Usage: node scripts/check-exports.mjs
 */
import { createRequire } from "node:module"
import { existsSync, readFileSync, realpathSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { EXPORT_BUDGET } from "./export-budget.mjs"

const ts = createRequire(import.meta.url)("typescript")

// ── Reading a declaration entry ──────────────────────────────────────────────

/** The conditions of an `exports` entry that lead to declarations, in order. */
const TYPE_CONDITIONS = ["types", "import", "default"]

/**
 * The declaration file `subpath` of a package resolves to, as the `exports`
 * map says, or undefined. A package without an `exports` map is read through
 * `types`/`typings` for its root.
 */
export function typesFileOf(packageDir, subpath) {
  const manifest = JSON.parse(
    readFileSync(join(packageDir, "package.json"), "utf8")
  )
  const find = (target) => {
    if (typeof target === "string") {
      return /\.d\.[cm]?ts$/.test(target) ? target : undefined
    }
    if (target === null || typeof target !== "object") return undefined
    for (const condition of TYPE_CONDITIONS) {
      if (condition in target) {
        const found = find(target[condition])
        if (found !== undefined) return found
      }
    }
    return undefined
  }
  const target =
    manifest.exports === undefined
      ? subpath === "."
        ? (manifest.types ?? manifest.typings)
        : undefined
      : find(manifest.exports[subpath])
  return target === undefined ? undefined : resolve(packageDir, target)
}

/** What kind of thing an exported symbol is, for messages. */
function kindOf(checker, symbol) {
  let target = symbol
  if (symbol.flags & ts.SymbolFlags.Alias) {
    try {
      target = checker.getAliasedSymbol(symbol)
    } catch {
      return "unknown"
    }
  }
  const value = (target.flags & ts.SymbolFlags.Value) !== 0
  const type = (target.flags & ts.SymbolFlags.Type) !== 0
  return value && type
    ? "value and type"
    : value
      ? "value"
      : type
        ? "type"
        : "unknown"
}

/**
 * The names each declaration file exports, in one compiler program: every
 * name of the module's export table, so `export *`, `export { x } from` and
 * `export type { T }` count like a direct declaration.
 *
 * @param {string[]} files Absolute paths of `.d.ts` files.
 * @returns {Map<string, Map<string, string>>} file -> name -> kind
 */
export function readExportNames(files) {
  const program = ts.createProgram(files, {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true,
    noEmit: true,
    types: [],
  })
  const checker = program.getTypeChecker()
  const found = new Map()
  for (const file of files) {
    const source = program.getSourceFile(file)
    const moduleSymbol = source && checker.getSymbolAtLocation(source)
    if (!moduleSymbol) {
      throw new Error(
        `${file} is not a module: it exports nothing a consumer can import`
      )
    }
    found.set(
      file,
      new Map(
        checker
          .getExportsOfModule(moduleSymbol)
          .map((symbol) => [symbol.name, kindOf(checker, symbol)])
      )
    )
  }
  return found
}

// ── The check itself ─────────────────────────────────────────────────────────

/** An `-alpha.` prerelease: the version while the planned names are still landing. */
export const isAlpha = (version) => /-alpha(?:\.|$)/.test(version)

/**
 * Compares what the entries export with the budget. Pure: it reads nothing.
 *
 * @param {object} input
 * @param {{ id: string, cap: number, planned: string[], transitional?: string[] }[]} input.entries
 *   The budget's entries.
 * @param {{ id: string, version: string, names: Map<string, string> }[]} input.exported
 *   What each entry exports, by `id`.
 * @param {Map<string, string[]>} input.foreign Name -> where else it is
 *   exported (`@candid-core/schema/validate`, `@tanstack/query-core`, ...).
 * @returns {{ failures: string[], pending: Map<string, string[]>, transitional: Map<string, string[]> }}
 */
export function evaluate({ entries, exported, foreign }) {
  const failures = []
  const pending = new Map()
  const transitional = new Map()
  const budgetOf = new Map(entries.map((entry) => [entry.id, entry]))
  const owners = new Map() // name -> entry ids that export it

  // The plan has to be consistent before anything is measured against it.
  const planners = new Map() // name -> entry ids that plan it
  for (const entry of entries) {
    const planned = new Set(entry.planned)
    if (planned.size !== entry.planned.length) {
      failures.push(`${entry.id}: the budget plans a name twice`)
    }
    if (planned.size > entry.cap) {
      failures.push(
        `${entry.id}: the budget plans ${planned.size} names for a cap of ${entry.cap}`
      )
    }
    for (const name of entry.transitional ?? []) {
      if (planned.has(name)) {
        failures.push(
          `${entry.id}: "${name}" is both planned and transitional in the budget`
        )
      }
    }
    for (const name of planned) {
      planners.set(name, [...(planners.get(name) ?? []), entry.id])
    }
  }
  for (const [name, ids] of planners) {
    if (ids.length > 1) {
      failures.push(
        `The budget plans "${name}" for ${ids.join(" and ")}. D35: one import path per name.`
      )
    }
  }

  for (const { id, version, names } of exported) {
    const entry = budgetOf.get(id)
    if (entry === undefined) {
      failures.push(`${id} is not an entry of the budget`)
      continue
    }
    const planned = new Set(entry.planned)
    const allowed = new Set(entry.transitional ?? [])
    const lenient = isAlpha(version)
    const exportedNames = [...names.keys()]

    for (const name of exportedNames) {
      owners.set(name, [...(owners.get(name) ?? []), id])
      if (!planned.has(name) && !allowed.has(name)) {
        failures.push(
          `${id} exports "${name}" (${names.get(name)}), which the export budget does not plan for it. ` +
            `A public name is a decision: add it to \`planned\` in scripts/export-budget.mjs in the same pull request, or do not export it.`
        )
      }
    }

    const counted = exportedNames.filter((name) => !allowed.has(name))
    if (counted.length > entry.cap) {
      failures.push(
        `${id} exports ${counted.length} names, over its cap of ${entry.cap}: ${counted.join(", ")}`
      )
    }

    const missing = [...planned].filter((name) => !names.has(name))
    if (missing.length > 0) {
      if (lenient) pending.set(id, missing)
      else {
        failures.push(
          `${id} (${version}) does not export ${missing.join(", ")}, which the budget plans. From the first beta every planned name must exist.`
        )
      }
    }

    const leftover = exportedNames.filter((name) => allowed.has(name))
    if (leftover.length > 0) {
      if (lenient) transitional.set(id, leftover)
      else {
        failures.push(
          `${id} (${version}) still exports the transitional ${leftover.join(", ")}. IR4b (#783) replaces them with ${entry.planned.join(" and ")} and deletes the allowance; it must land before the first beta.`
        )
      }
    }
  }

  for (const [name, ids] of owners) {
    if (ids.length > 1) {
      failures.push(
        `"${name}" is exported by ${ids.join(" and ")}. D35: one import path per name across ic-reactor.`
      )
    }
  }

  // D35 against the libraries an app imports beside ours, for what is exported
  // and for what is only planned, so the plan itself cannot collide.
  const reported = new Set()
  for (const entry of entries) {
    const here = exported.find((candidate) => candidate.id === entry.id)
    const names = new Set([
      ...entry.planned,
      ...(here ? here.names.keys() : []),
    ])
    for (const name of names) {
      const sources = foreign.get(name)
      if (sources === undefined) continue
      const key = `${entry.id}\0${name}`
      if (reported.has(key)) continue
      reported.add(key)
      const state = here?.names.has(name) ? "exports" : "plans to export"
      failures.push(
        `${entry.id} ${state} "${name}", which ${sources.join(" and ")} also export${sources.length === 1 ? "s" : ""}. ` +
          `D35: one import path per name, and it is theirs. Import it from there; do not re-export it.`
      )
    }
  }

  return { failures, pending, transitional }
}

// ── Reading the repository ───────────────────────────────────────────────────

/** The directory of `name` installed at or above `from`, or undefined. */
function findInstalled(from, name) {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name)
    if (existsSync(join(candidate, "package.json")))
      return realpathSync(candidate)
    if (dirname(dir) === dir) return undefined
  }
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"))

/**
 * Reads what every entry of the budget exports and what the foreign packages
 * export, from the built and installed files under `rootDir`.
 *
 * @returns {{ exported: object[], foreign: Map<string, string[]>, failures: string[] }}
 *   `failures` are the problems of reading, such as a missing build.
 */
export function collect({ rootDir, budget = EXPORT_BUDGET }) {
  const failures = []
  const files = []

  const entryFiles = []
  for (const entry of budget.entries) {
    const packageDir = join(rootDir, entry.package)
    const file = typesFileOf(packageDir, entry.subpath)
    if (file === undefined) {
      failures.push(
        `${entry.id}: the \`exports\` map of ${entry.package}/package.json has no declarations for "${entry.subpath}"`
      )
    } else if (!existsSync(file)) {
      failures.push(
        `${entry.id}: ${file} does not exist. Run \`pnpm build\` first.`
      )
    } else {
      entryFiles.push({
        entry,
        file,
        version: readJson(join(packageDir, "package.json")).version,
      })
      files.push(file)
    }
  }

  const foreignFiles = []
  for (const source of budget.foreign) {
    const installed = findInstalled(join(rootDir, source.from), source.package)
    if (installed === undefined) {
      failures.push(
        `${source.package} is not installed for ${source.from}; run \`pnpm install\`. The export budget needs its declarations.`
      )
      continue
    }
    const version = readJson(join(installed, "package.json")).version
    if (source.pin !== undefined && version !== source.pin) {
      failures.push(
        `${source.package} is installed at ${version}, but the export budget is written against ${source.pin}. ` +
          `Update \`pin\` in scripts/export-budget.mjs together with the dependency, after reading the new export list.`
      )
    }
    for (const subpath of source.subpaths) {
      const file = typesFileOf(installed, subpath)
      const where =
        subpath === "."
          ? source.package
          : `${source.package}/${subpath.slice(2)}`
      if (file === undefined || !existsSync(file)) {
        failures.push(`${where}: no declaration file to read`)
        continue
      }
      foreignFiles.push({ where, file })
      files.push(file)
    }
  }

  const read = files.length > 0 ? readExportNames(files) : new Map()
  const foreign = new Map()
  for (const { where, file } of foreignFiles) {
    for (const name of read.get(file).keys()) {
      foreign.set(name, [...(foreign.get(name) ?? []), where])
    }
  }
  const exported = entryFiles.map(({ entry, file, version }) => ({
    id: entry.id,
    version,
    names: read.get(file),
  }))
  return { exported, foreign, failures }
}

// ── The command ──────────────────────────────────────────────────────────────

function main() {
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..")
  const { exported, foreign, failures: unreadable } = collect({ rootDir })
  const { failures, pending, transitional } = evaluate({
    entries: EXPORT_BUDGET.entries,
    exported,
    foreign,
  })
  const all = [...unreadable, ...failures]

  for (const entry of exported) {
    const budget = EXPORT_BUDGET.entries.find(
      (candidate) => candidate.id === entry.id
    )
    const allowed = new Set(budget.transitional ?? [])
    const counted = [...entry.names.keys()].filter((name) => !allowed.has(name))
    console.log(
      `${entry.id} ${entry.version}: ${counted.length} of ${budget.cap} names` +
        `${allowed.size > 0 ? ` (+ ${[...entry.names.keys()].length - counted.length} transitional)` : ""}`
    )
    const waiting = pending.get(entry.id)
    if (waiting) console.log(`  pending (alpha): ${waiting.join(", ")}`)
    const leftover = transitional.get(entry.id)
    if (leftover)
      console.log(
        `  transitional, allowed until the first beta: ${leftover.join(", ")}`
      )
  }

  if (all.length > 0) {
    console.error("\nExport budget check failed:\n")
    for (const failure of all) console.error(`- ${failure}`)
    process.exitCode = 1
    return
  }
  console.log("\nExport budget check passed.")
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main()
}
