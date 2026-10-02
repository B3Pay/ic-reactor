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
 * - a package under `packages/` maps a subpath of its `exports` that the budget
 *   has no entry for, has no `exports` map at all, or is publishable with no
 *   entry (a subpath is public surface whatever it is called: `./internal`
 *   would hand out every name the entries do not);
 * - the declarations behind two conditions of one entry (`import` and
 *   `require`, say) do not export the same names;
 * - an entry exports a name its budget does not plan;
 * - an entry exports more names than its cap;
 * - a name is exported by two entries (D35);
 * - a name is also exported by `@candid-core/schema` (any of its four entries)
 *   or by TanStack Query (D35: `principal`, `skipToken` and `queryOptions` have
 *   one import path each, and it is never ours);
 * - the installed `@candid-core/schema` is not the pinned version, or any
 *   manifest of the repository declares it at another version, since its
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
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { EXPORT_BUDGET } from "./export-budget.mjs"

const ts = createRequire(import.meta.url)("typescript")

// ── Reading a declaration entry ──────────────────────────────────────────────

/** The conditions of an `exports` entry that lead to declarations, in order. */
const TYPE_CONDITIONS = ["types", "import", "default"]

const DECLARATION = /\.d\.[cm]?ts$/

/** The declaration file TypeScript looks for beside a JavaScript target. */
const IMPLICIT_DECLARATION = [
  [/\.js$/, ".d.ts"],
  [/\.cjs$/, ".d.cts"],
  [/\.mjs$/, ".d.mts"],
]

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"))

/**
 * A manifest's `exports` as a map of subpath to target. The sugar forms (a
 * string, an array, or conditions with no subpath keys) are the root subpath;
 * a manifest without `exports` has none, and is read through `types`.
 */
export function exportsMapOf(manifest) {
  const { exports } = manifest
  if (exports === undefined || exports === null) return undefined
  if (
    typeof exports === "string" ||
    Array.isArray(exports) ||
    !Object.keys(exports).some((key) => key.startsWith("."))
  ) {
    return { ".": exports }
  }
  return exports
}

/**
 * The declaration file `subpath` of a package resolves to, as the `exports`
 * map says, or undefined. A package without an `exports` map is read through
 * `types`/`typings` for its root.
 */
export function typesFileOf(packageDir, subpath) {
  const manifest = readJson(join(packageDir, "package.json"))
  const find = (target) => {
    if (typeof target === "string") {
      return DECLARATION.test(target) ? target : undefined
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
  const map = exportsMapOf(manifest)
  const target =
    map === undefined
      ? subpath === "."
        ? (manifest.types ?? manifest.typings)
        : undefined
      : find(map[subpath])
  return target === undefined ? undefined : resolve(packageDir, target)
}

/**
 * Every declaration file `subpath` can resolve to, through any condition of
 * its `exports` target: `import` and `require` branches, and the `.d.ts`
 * TypeScript finds beside a JavaScript target that no `types` key precedes. A
 * package can declare different names for the two module systems, and
 * `typesFileOf` reads only one of them.
 *
 * TypeScript tries the conditions of an object in key order and takes the
 * first that resolves, so a JavaScript target is read for its sibling unless a
 * `types` key came earlier in the same object or in an object around it. A
 * condition placed before `types` (`development`, `react-server`, or one a
 * project names in `customConditions`) still wins for a consumer that sets it,
 * so its sibling is part of the surface; a condition after `types` is never
 * reached.
 *
 * @returns {{ file: string, via: string }[]} `via` is the condition path that
 *   leads to the file, such as `require.types`.
 */
export function declarationFilesOf(packageDir, subpath) {
  const manifest = readJson(join(packageDir, "package.json"))
  const map = exportsMapOf(manifest)
  const found = []
  const add = (path, via) => {
    const file = resolve(packageDir, path)
    if (!found.some((known) => known.file === file)) {
      found.push({ file, via: via.length > 0 ? via.join(".") : subpath })
    }
  }
  const walk = (node, via, typed) => {
    if (typeof node === "string") {
      if (DECLARATION.test(node)) return add(node, via)
      if (typed) return
      const implicit = IMPLICIT_DECLARATION.find(([js]) => js.test(node))
      if (implicit === undefined) return
      const path = node.replace(implicit[0], implicit[1])
      if (existsSync(resolve(packageDir, path))) add(path, via)
      return
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item, via, typed)
      return
    }
    if (node === null || typeof node !== "object") return
    // `types` closes the siblings after it, and whatever they contain, not the
    // ones before it: those are tried first.
    let declared = typed
    for (const [condition, value] of Object.entries(node)) {
      walk(value, [...via, condition], declared)
      if (condition === "types") declared = true
    }
  }
  if (map === undefined) {
    const types = subpath === "." ? (manifest.types ?? manifest.typings) : null
    if (typeof types === "string") add(types, ["types"])
  } else {
    walk(map[subpath], [], false)
  }
  return found
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
      // The other conditions of the same entry (`require` beside `import`)
      // must declare the same names as the one every other check reads.
      const alternates = []
      for (const other of declarationFilesOf(packageDir, entry.subpath)) {
        if (other.file === file) continue
        if (existsSync(other.file)) alternates.push(other)
        else {
          failures.push(
            `${entry.id}: the "${other.via}" condition declares ${other.file}, which does not exist. Run \`pnpm build\` first.`
          )
        }
      }
      entryFiles.push({
        entry,
        file,
        alternates,
        version: readJson(join(packageDir, "package.json")).version,
      })
      files.push(file, ...alternates.map((other) => other.file))
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
    if (source.pin !== undefined) {
      // The list a name is checked against is the one the packages install,
      // and the install read above is the root's. A package that declares
      // another version would install another list.
      for (const { manifestPath, field, range } of declaredVersions(
        rootDir,
        source.package,
        budget.packagesDir
      )) {
        if (range !== source.pin) {
          failures.push(
            `${manifestPath} declares ${source.package} "${range}" in ${field}, but the export budget is written against exactly ${source.pin}. ` +
              `The schema is pinned exactly (D24): declare ${source.pin}, or update \`pin\` in scripts/export-budget.mjs with every declaration, after reading the new export list.`
          )
        }
      }
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
  for (const { entry, file, alternates } of entryFiles) {
    const primary = read.get(file)
    for (const other of alternates) {
      const names = read.get(other.file)
      const onlyHere = [...primary.keys()].filter((name) => !names.has(name))
      const onlyThere = [...names.keys()].filter((name) => !primary.has(name))
      if (onlyHere.length === 0 && onlyThere.length === 0) continue
      failures.push(
        `${entry.id}: the "${other.via}" condition (${relative(rootDir, other.file)}) does not export the names of ${relative(rootDir, file)}` +
          `${onlyHere.length > 0 ? `; missing there: ${onlyHere.join(", ")}` : ""}` +
          `${onlyThere.length > 0 ? `; only there: ${onlyThere.join(", ")}` : ""}. ` +
          `An entry has one public surface: every condition must declare the same names, or the budget reads only one of them.`
      )
    }
  }
  return { exported, foreign, failures }
}

// ── Reading the packages ─────────────────────────────────────────────────────

/** The directory the publishable packages live in, below the repository root. */
const PACKAGES_DIR = "packages"

/** The manifest fields that declare a dependency. */
const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
]

/** The package directories (`packages/<name>`) that hold a manifest. */
function packageDirsOf(rootDir, packagesDir = PACKAGES_DIR) {
  const base = join(rootDir, packagesDir)
  if (!existsSync(base)) return []
  return readdirSync(base, { withFileTypes: true })
    .filter(
      (dirent) =>
        dirent.isDirectory() &&
        existsSync(join(base, dirent.name, "package.json"))
    )
    .map((dirent) => `${packagesDir}/${dirent.name}`)
    .sort()
}

/**
 * The directory patterns of `pnpm-workspace.yaml`'s `packages:` list, read
 * without a YAML parser: the list is a flat sequence of quoted or bare
 * strings. `!pattern` excludes. Empty when there is no workspace file.
 */
function workspacePatternsOf(rootDir) {
  const path = join(rootDir, "pnpm-workspace.yaml")
  if (!existsSync(path)) return []
  const patterns = []
  let inPackages = false
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true
      continue
    }
    if (!inPackages) continue
    const item = /^\s+-\s+["']?([^"'#]+?)["']?\s*(#.*)?$/.exec(line)
    if (item) patterns.push(item[1])
    else if (/^\S/.test(line)) inPackages = false
  }
  return patterns
}

/**
 * The directories a workspace pattern names, relative to `rootDir`: `*`
 * matches one directory, `**` any depth. `node_modules` and dot-directories
 * are never entered.
 */
function expandPattern(rootDir, pattern) {
  const walk = (dir, segments) => {
    if (segments.length === 0) return [dir]
    const [head, ...rest] = segments
    const childrenOf = (at) => {
      const full = join(rootDir, at)
      if (!existsSync(full)) return []
      return readdirSync(full, { withFileTypes: true })
        .filter(
          (dirent) =>
            dirent.isDirectory() &&
            dirent.name !== "node_modules" &&
            !dirent.name.startsWith(".")
        )
        .map((dirent) => (at === "" ? dirent.name : `${at}/${dirent.name}`))
    }
    if (head === "**") {
      return [
        ...walk(dir, rest),
        ...childrenOf(dir).flatMap((child) => walk(child, segments)),
      ]
    }
    if (head === "*")
      return childrenOf(dir).flatMap((child) => walk(child, rest))
    return walk(dir === "" ? head : `${dir}/${head}`, rest)
  }
  return walk("", pattern.split("/").filter(Boolean))
}

/**
 * Every manifest of the repository: the root's, each publishable package's
 * under `packagesDir`, and every workspace member `pnpm-workspace.yaml`
 * names (e2e, docs, examples), since any of them could declare a dependency
 * the root install then resolves for all.
 */
function workspaceManifestsOf(rootDir, packagesDir) {
  const patterns = workspacePatternsOf(rootDir)
  const excluded = new Set(
    patterns
      .filter((pattern) => pattern.startsWith("!"))
      .flatMap((pattern) => expandPattern(rootDir, pattern.slice(1)))
  )
  const dirs = new Set([
    ...packageDirsOf(rootDir, packagesDir),
    ...patterns
      .filter((pattern) => !pattern.startsWith("!"))
      .flatMap((pattern) => expandPattern(rootDir, pattern)),
  ])
  return [
    "package.json",
    ...[...dirs]
      .filter(
        (dir) =>
          !excluded.has(dir) && existsSync(join(rootDir, dir, "package.json"))
      )
      .sort()
      .map((dir) => `${dir}/package.json`),
  ]
}

/**
 * Every place a manifest of the repository (the root's, each package's and
 * every other workspace member's) declares a dependency on `name`.
 */
function declaredVersions(rootDir, name, packagesDir) {
  const found = []
  const manifests = workspaceManifestsOf(rootDir, packagesDir)
  for (const manifestPath of manifests) {
    const path = join(rootDir, manifestPath)
    if (!existsSync(path)) continue
    const manifest = readJson(path)
    for (const field of DEPENDENCY_FIELDS) {
      const range = manifest[field]?.[name]
      if (range !== undefined) found.push({ manifestPath, field, range })
    }
  }
  return found
}

/**
 * Checks that the budget covers every way a package can be imported from: a
 * package of `packages/` that publishes, with the subpaths of its `exports`.
 * `collect` reads only the entries the budget lists, so without this a new
 * subpath (`"./internal": ...`) or a new package would ship names no budget
 * ever looked at.
 *
 * Private packages are skipped, and so is `./package.json`. A subpath mapped
 * to `null` is blocked, not exposed.
 *
 * @returns {string[]} The failures.
 */
export function checkPackages({ rootDir, budget = EXPORT_BUDGET }) {
  const failures = []
  const budgeted = new Map() // package dir -> subpaths with an entry
  for (const entry of budget.entries) {
    budgeted.set(entry.package, [
      ...(budgeted.get(entry.package) ?? []),
      entry.subpath,
    ])
  }
  for (const dir of packageDirsOf(rootDir, budget.packagesDir)) {
    const manifest = readJson(join(rootDir, dir, "package.json"))
    if (manifest.private === true) continue
    const name = manifest.name ?? dir
    const subpaths = budgeted.get(dir)
    if (subpaths === undefined) {
      failures.push(
        `${dir} (${name}) is publishable but has no entry in the export budget, so nothing limits what it exports. ` +
          `Add its entry points to scripts/export-budget.mjs, or mark the package private.`
      )
      continue
    }
    const map = exportsMapOf(manifest)
    if (map === undefined) {
      failures.push(
        `${dir}/package.json has no \`exports\` map, so every file of ${name} is importable and the budget reads only the entry. ` +
          `Map the entries in \`exports\`.`
      )
      continue
    }
    for (const [subpath, target] of Object.entries(map)) {
      if (subpath === "./package.json" || target === null) continue
      if (!subpaths.includes(subpath)) {
        failures.push(
          `${dir}/package.json maps the subpath "${subpath}", which the export budget has no entry for. ` +
            `Every importable subpath is public surface: budget it in scripts/export-budget.mjs, or remove it from \`exports\`.`
        )
      }
    }
  }
  return failures
}

// ── The command ──────────────────────────────────────────────────────────────

/**
 * Everything the gate checks, against the files under `rootDir`.
 *
 * @returns {{ exported: object[], pending: Map<string, string[]>, transitional: Map<string, string[]>, failures: string[] }}
 */
export function checkRepository({ rootDir, budget = EXPORT_BUDGET }) {
  const {
    exported,
    foreign,
    failures: unreadable,
  } = collect({ rootDir, budget })
  const unbudgeted = checkPackages({ rootDir, budget })
  const { failures, pending, transitional } = evaluate({
    entries: budget.entries,
    exported,
    foreign,
  })
  return {
    exported,
    pending,
    transitional,
    failures: [...unreadable, ...unbudgeted, ...failures],
  }
}

function main() {
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..")
  const {
    exported,
    pending,
    transitional,
    failures: all,
  } = checkRepository({ rootDir })

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
