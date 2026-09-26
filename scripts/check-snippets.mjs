#!/usr/bin/env node
/**
 * Type-checks the TypeScript code fences that readers and AI agents copy.
 *
 * The root and package `llms.txt` guides, the skills and the READMEs are where
 * an agent in a consumer project learns the API, and it pastes their snippets
 * as they stand. `check:ai-context` keeps their versions and links current but
 * never compiles a line of code, so a renamed export or a changed signature
 * left a snippet that no longer compiles with every gate green.
 *
 * This extracts every ```ts, ```tsx and ```typescript fence from those files,
 * writes each one to its own module in a temporary directory, and compiles them
 * all as one TypeScript program with the compiler options of Vite's React
 * template (`strict`, `jsx: react-jsx`, `moduleResolution: bundler`,
 * `verbatimModuleSyntax`). The directory reaches the `@ic-reactor/*` packages
 * through symlinks, so a snippet compiles against the declarations
 * `pnpm build` wrote to `packages/<name>/dist`, through each package's
 * `exports` map, as it would in an app that installed them. Build first.
 *
 * ## The app a snippet runs in
 *
 * A snippet takes an app for granted: a canister's generated
 * `./declarations/backend`, a `./reactor` module holding the setup, a
 * `clientManager` built earlier on the page. `scripts/check-snippets/` holds
 * that app, and each document gets its own, because documents disagree: the
 * guides' `./reactor` builds a `DisplayReactor`, while the React README's
 * builds a raw `Reactor` over a canister with other methods.
 *
 * - `scripts/check-snippets/app/` is the app of every document not listed in
 *   CONTEXTS below. A context directory holds only what differs for its
 *   documents; everything else falls through to `app/`.
 * - A relative import that resolves to nothing (`./reactor`,
 *   `../declarations/backend`) resolves to the module of the same path in the
 *   snippet's context directory, then in `app/`. The longest trailing part of
 *   the path that names one wins, so `./declarations/backend/declarations/backend`
 *   finds `declarations/backend.ts`.
 * - The names `globals.ts` exports stand for names a snippet uses without
 *   importing or declaring them, such as a `clientManager` from an earlier
 *   snippet. Each snippet imports those it does not declare itself, on a line
 *   added above its first.
 * - `ambient.d.ts` stubs the few third-party modules snippets import that no
 *   workspace package installs.
 *
 * Declare a missing app name there. Do not rewrite a snippet to suit the
 * checker, and never declare a library export there: a snippet that uses
 * `createQuery` must import it, or an agent pasting it cannot run it.
 *
 * ## The consumer guides
 *
 * `llms.txt`, `llms-full.txt`, each package's `llms.txt` and the consumer skill
 * (`skill-packages/ic-reactor/`) are what an agent in another project reads,
 * and it pastes their snippets into an app that has none of the names above.
 * Two rules are stricter there:
 *
 * - A snippet gets no globals. Every name it uses is imported or declared in
 *   it.
 * - A relative import resolves first to a module the guide shows: a snippet
 *   of the same document (or of the same skill) whose first line names its
 *   file, such as `// src/reactor.ts` for `./reactor`. Only a module the guide
 *   never shows, such as the canister's declarations, comes from a fixture.
 *
 * ## Server code
 *
 * A snippet whose first line calls it a React Server Component, or that holds
 * a `"use server"` directive, imports `@ic-reactor/react` as Next.js resolves
 * it there: the `react-server` entry, which exports no hooks, no hook
 * factories and no `defineReactor`. TypeScript alone reads the `types`
 * condition and would accept them.
 *
 * ## Opting out
 *
 * A fence that is not code to paste, such as a type signature or an interface
 * restating a library type, opts out with `nocheck` after its language,
 * ```ts nocheck, or with a first line of `// @snippet-skip`. Use it sparingly:
 * a skipped snippet is one nothing verifies. Give a placeholder such as `...`
 * a real value instead.
 *
 * Usage
 *   node scripts/check-snippets.mjs [--docs] [--verbose] [--keep] [path...]
 *
 *   path...    check only the files whose repo-relative path contains one of
 *              these strings
 *   --docs     also check the docs site's MDX pages. Their results are
 *              reported but never fail the run: they have not been brought
 *              under the gate yet.
 *   --verbose  list every snippet with its result
 *   --keep     leave the temporary directory in place (debugging)
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..")
const fixturesDir = join(rootDir, "scripts", "check-snippets")
const ts = createRequire(import.meta.url)("typescript")

const args = process.argv.slice(2)
const includeDocs = args.includes("--docs")
const verbose = args.includes("--verbose")
const keep = args.includes("--keep")
const filters = args.filter((arg) => !arg.startsWith("--"))

/** Fence languages that are compiled, and the extension each module gets. */
const LANGUAGES = { ts: ".ts", typescript: ".ts", tsx: ".tsx" }

const SKIP_INFO = "nocheck"
const SKIP_COMMENT = /^\s*\/\/\s*@snippet-skip\b/

/**
 * A first line naming the file the snippet is, such as `// src/reactor.ts`
 * or `// app/Supply.tsx: a React Server Component`. It captures the path
 * without its extension.
 */
const MODULE_HEADER = /^\s*\/\/\s*((?:[\w.-]+\/)*[\w-]+)\.tsx?\b/

/**
 * A snippet of server code: a first line calling it a React Server
 * Component, or a `"use server"` directive (a server action).
 */
const SERVER_HEADER = /\bReact Server Component\b/i
const USE_SERVER = /^\s*["']use server["']/m

/**
 * The guides an agent in a consumer project reads: the docs site's
 * `llms.txt` and `llms-full.txt`, each package's `llms.txt` (shipped in its
 * tarball) and the consumer skill. The agent pastes their snippets into an app
 * that has none of this checker's globals, so a snippet there gets no
 * globals: every name it uses is imported, declared, or exported by a module
 * the guide itself shows.
 */
function isConsumerGuide(file) {
  return (
    file === "llms.txt" ||
    file === "llms-full.txt" ||
    /^packages\/[^/]+\/llms\.txt$/.test(file) ||
    file.startsWith("skill-packages/ic-reactor/")
  )
}

/**
 * The documents whose snippets share the modules they define: all the files
 * of one skill (its SKILL.md and references), otherwise one document.
 */
function moduleGroup(file) {
  const skill = /^skill-packages\/[^/]+\//.exec(file)
  return skill ? skill[0] : file
}

/** The default app, `scripts/check-snippets/app/`. */
const DEFAULT_CONTEXT = "app"

/**
 * Documents whose snippets assume an app other than the default one, by
 * repo-relative path, and the directory under `scripts/check-snippets/` that
 * holds what differs.
 */
const CONTEXTS = {
  "README.md": "readme",
  "packages/react/README.md": "react-readme",
  "packages/core/README.md": "core",
  "packages/core/llms.txt": "core",
  "packages/candid/README.md": "candid",
  "packages/candid/llms.txt": "candid",
  "skill-packages/ic-reactor-hooks/SKILL.md": "hooks-skill",
  "skill-packages/ic-reactor-hooks/references/patterns.md": "hooks-skill",
}

/**
 * The compiler options of Vite's React + TypeScript template, the setup most
 * consumers paste into. `verbatimModuleSyntax` is on there, so a snippet that
 * imports a type without `type` fails in that app and fails here. Unlike the
 * template, `noUnusedLocals` and `noUnusedParameters` are off (a snippet
 * declares names to show them, not to use them), and `@types/node` replaces
 * `vite/client`, for the `vite.config.ts` and script snippets.
 */
const COMPILER_OPTIONS = {
  target: "ES2022",
  lib: ["ES2022", "DOM", "DOM.Iterable"],
  module: "ESNext",
  moduleResolution: "bundler",
  moduleDetection: "force",
  verbatimModuleSyntax: true,
  erasableSyntaxOnly: true,
  jsx: "react-jsx",
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  noFallthroughCasesInSwitch: true,
  types: ["node"],
}

/**
 * Where third-party packages are linked from, in order of preference. A
 * snippet can import anything a workspace package installs, and the first
 * directory listed here that has it wins, so `react` and `@tanstack/*`
 * resolve to the copies `@ic-reactor/react` itself compiles against.
 */
const DEPENDENCY_SOURCES = [
  "packages/react",
  "packages/core",
  "packages/candid",
  "packages/parser",
  "packages/vite-plugin",
  "packages/codegen",
  "packages/cli",
  ".",
]

// ── Source files ─────────────────────────────────────────────────────────────

function walk(dir, predicate, out = []) {
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue
      walk(path, predicate, out)
    } else if (predicate(path)) {
      out.push(path)
    }
  }
  return out
}

const toPosix = (path) => path.split(sep).join("/")

const packageDirs = readdirSync(join(rootDir, "packages"))
  .filter((dir) => existsSync(join(rootDir, "packages", dir, "package.json")))
  .sort()

/** The files agents and npm readers are pointed at. */
function gatedFiles() {
  return [
    "llms.txt",
    "llms-full.txt",
    "README.md",
    ...packageDirs.flatMap((dir) => [
      `packages/${dir}/llms.txt`,
      `packages/${dir}/README.md`,
    ]),
    ...walk(join(rootDir, "skill-packages"), (path) =>
      path.endsWith(".md")
    ).map((path) => toPosix(relative(rootDir, path))),
  ].filter((file) => existsSync(join(rootDir, file)))
}

/** The docs site's hand-written pages; `libs/` is TypeDoc output. */
function docsFiles() {
  const docsDir = join(rootDir, "docs", "src", "content", "docs")
  return walk(docsDir, (path) => path.endsWith(".mdx"))
    .filter((path) => !path.startsWith(join(docsDir, "libs") + sep))
    .map((path) => toPosix(relative(rootDir, path)))
}

// ── Fence extraction ─────────────────────────────────────────────────────────

/**
 * The fenced code blocks of a Markdown (or MDX) file, following CommonMark: a
 * fence closes on a line of the same character, at least as long, with no
 * info string, so a ```ts inside a ````markdown block is content, not a fence.
 * The opening fence's indentation is removed from each line (fences nested in
 * lists and MDX components are indented).
 *
 * @returns {{ lang: string, info: string[], line: number, code: string }[]}
 *   `line` is the 1-based line of the fence's first line of code.
 */
function extractFences(text) {
  const lines = text.split("\n")
  const fences = []
  let open = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (open === null) {
      const match = /^(\s*)(`{3,}|~{3,})\s*([^\s`]*)(.*)$/.exec(line)
      if (match) {
        open = {
          indent: match[1].length,
          marker: match[2],
          lang: match[3].toLowerCase(),
          info: match[4].trim().split(/\s+/).filter(Boolean),
          line: i + 2,
          body: [],
        }
      }
      continue
    }
    const close = /^\s*(`{3,}|~{3,})\s*$/.exec(line)
    if (
      close &&
      close[1][0] === open.marker[0] &&
      close[1].length >= open.marker.length
    ) {
      const { lang, info, line: start, body } = open
      fences.push({ lang, info, line: start, code: body.join("\n") })
      open = null
      continue
    }
    const indent = /^\s*/.exec(line)[0].length
    open.body.push(line.slice(Math.min(indent, open.indent)))
  }
  return fences
}

function collectSnippets(files, docs) {
  const snippets = []
  for (const file of files) {
    const text = readFileSync(join(rootDir, file), "utf8")
    for (const fence of extractFences(text)) {
      if (!(fence.lang in LANGUAGES)) continue
      const firstLine = fence.code.split("\n").find((l) => l.trim() !== "")
      const skipped =
        fence.info.includes(SKIP_INFO) ||
        (firstLine !== undefined && SKIP_COMMENT.test(firstLine))
      const defines =
        firstLine === undefined ? undefined : MODULE_HEADER.exec(firstLine)
      snippets.push({
        file,
        line: fence.line,
        lang: fence.lang,
        code: fence.code,
        context: CONTEXTS[file] ?? DEFAULT_CONTEXT,
        group: moduleGroup(file),
        defines: defines ? defines[1].split("/") : undefined,
        selfContained: isConsumerGuide(file),
        server:
          (firstLine !== undefined && SERVER_HEADER.test(firstLine)) ||
          USE_SERVER.test(fence.code),
        skipped,
        docs,
      })
    }
  }
  return snippets
}

// ── The app a snippet assumes ────────────────────────────────────────────────

/** Whether a statement carries the `export` modifier. */
const isExported = (node) =>
  ts.getModifiers?.(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)

/** The names a binding (`a`, `{ a, b: c }`, `[d, ...e]`) declares. */
function bindingNames(name, out = []) {
  if (ts.isIdentifier(name)) out.push(name.text)
  else
    for (const element of name.elements) {
      if (!ts.isOmittedExpression(element)) bindingNames(element.name, out)
    }
  return out
}

function parse(fileName, text) {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true)
}

/**
 * The names a context's `globals.ts` exports, each marked as a type or a
 * value, following its `export * from "..."` statements.
 *
 * @returns {Map<string, "type" | "value">}
 */
function globalNames(file, seen = new Set()) {
  const names = new Map()
  if (seen.has(file)) return names
  seen.add(file)
  for (const statement of parse(file, readFileSync(file, "utf8")).statements) {
    if (
      ts.isExportDeclaration(statement) &&
      !statement.exportClause &&
      statement.moduleSpecifier
    ) {
      const target = join(dirname(file), statement.moduleSpecifier.text)
      for (const [name, kind] of globalNames(`${target}.ts`, seen)) {
        if (!names.has(name)) names.set(name, kind)
      }
    } else if (ts.isExportDeclaration(statement) && statement.exportClause) {
      for (const element of statement.exportClause.elements) {
        const isType = statement.isTypeOnly || element.isTypeOnly
        names.set(element.name.text, isType ? "type" : "value")
      }
    } else if (!isExported(statement)) {
      continue
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        for (const name of bindingNames(declaration.name)) {
          names.set(name, "value")
        }
      }
    } else if (
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)
    ) {
      names.set(statement.name.text, "type")
    } else if (statement.name && ts.isIdentifier(statement.name)) {
      names.set(statement.name.text, "value")
    }
  }
  return names
}

/** The names a snippet declares or imports at its top level. */
function declaredNames(sourceFile) {
  const names = new Set()
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause
      if (!clause) continue
      if (clause.name) names.add(clause.name.text)
      const bindings = clause.namedBindings
      if (bindings && ts.isNamespaceImport(bindings)) {
        names.add(bindings.name.text)
      } else if (bindings) {
        for (const element of bindings.elements) names.add(element.name.text)
      }
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        for (const name of bindingNames(declaration.name)) names.add(name)
      }
    } else if (statement.name && ts.isIdentifier(statement.name)) {
      names.add(statement.name.text)
    }
  }
  return names
}

/**
 * The module a relative import names in `context`: the longest trailing part
 * of its path that is a file in the context directory, then in `app/`.
 */
function findFixture(project, context, specifier) {
  const segments = specifier
    .split("/")
    .filter((segment) => segment !== "." && segment !== "..")
  const contexts = [...new Set([context, DEFAULT_CONTEXT])]
  for (let start = 0; start < segments.length; start++) {
    const path = segments.slice(start).join("/")
    for (const name of contexts) {
      for (const candidate of [
        `${path}.ts`,
        `${path}.tsx`,
        `${path}/index.ts`,
      ]) {
        const file = join(project, "fixtures", name, candidate)
        if (existsSync(file)) return file
      }
    }
  }
  return undefined
}

/**
 * The snippet module a relative import of a consumer guide names when the
 * guide shows that module itself: a snippet of the same document, or of the
 * same skill, whose first line names a path ending in the import's
 * (`// src/reactor.ts` for `./reactor`). The nearest one above the importing
 * snippet wins, then the first below it, then the first in another file of
 * the skill. The import is then checked against the module the reader was
 * shown, and a fixture cannot hide a name that module does not export.
 *
 * The READMEs keep their fixtures: they show a module such as `src/reactor.ts`
 * several times, once per alternative setup, and later sections mean the
 * first.
 */
function findPageModule(byModule, snippet, specifier) {
  if (!snippet.selfContained) return undefined
  const segments = specifier
    .split("/")
    .filter((segment) => segment !== "." && segment !== "..")
  const matches = (other) =>
    other !== snippet &&
    other.group === snippet.group &&
    other.defines !== undefined &&
    other.defines.length >= segments.length &&
    other.defines.slice(-segments.length).join("/") === segments.join("/")
  const candidates = [...byModule].filter(([, other]) => matches(other))
  const rank = ([, other]) =>
    other.file !== snippet.file
      ? Number.MAX_SAFE_INTEGER
      : other.line < snippet.line
        ? snippet.line - other.line
        : Number.MAX_SAFE_INTEGER / 2 + other.line
  candidates.sort((a, b) => rank(a) - rank(b))
  return candidates[0]?.[0]
}

// ── The compilation ──────────────────────────────────────────────────────────

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

/** The installed packages under `nodeModules`, scoped ones as `@scope/name`. */
function installedPackages(nodeModules) {
  if (!existsSync(nodeModules)) return []
  return readdirSync(nodeModules)
    .filter((entry) => !entry.startsWith("."))
    .flatMap((entry) =>
      entry.startsWith("@")
        ? readdirSync(join(nodeModules, entry)).map((n) => `${entry}/${n}`)
        : [entry]
    )
}

/**
 * Links every workspace package, and every dependency installed for one, into
 * `project/node_modules`. Returns the links, so they can be removed before the
 * directory is: they point into the workspace.
 */
function linkPackages(project) {
  const links = []
  const linked = new Set()
  const link = (target, name) => {
    if (linked.has(name)) return
    linked.add(name)
    const path = join(project, "node_modules", name)
    mkdirSync(dirname(path), { recursive: true })
    symlinkSync(target, path, "dir")
    links.push(path)
  }
  for (const dir of packageDirs) {
    const packageDir = join(rootDir, "packages", dir)
    const manifest = readJson(join(packageDir, "package.json"))
    if (manifest.private !== true && !existsSync(join(packageDir, "dist"))) {
      throw new Error(
        `${manifest.name} is not built (no dist/). Run \`pnpm build\` first.`
      )
    }
    link(packageDir, manifest.name)
  }
  for (const source of DEPENDENCY_SOURCES) {
    const sourceModules = join(rootDir, source, "node_modules")
    for (const name of installedPackages(sourceModules)) {
      link(join(sourceModules, name), name)
    }
  }
  return links
}

/**
 * Writes each snippet to `project/snippets/`, preceded by an import of the
 * globals it does not declare, and returns them by absolute module path.
 */
function writeSnippets(project, snippets) {
  const globals = new Map()
  const byModule = new Map()
  mkdirSync(join(project, "snippets"), { recursive: true })
  for (const snippet of snippets) {
    const slug = snippet.file.replace(/[^A-Za-z0-9]+/g, "_")
    const modulePath = toPosix(
      join(
        project,
        "snippets",
        `${slug}_L${snippet.line}${LANGUAGES[snippet.lang]}`
      )
    )

    const contextDir = join(project, "fixtures", snippet.context)
    const globalsFile = existsSync(join(contextDir, "globals.ts"))
      ? join(contextDir, "globals.ts")
      : join(project, "fixtures", DEFAULT_CONTEXT, "globals.ts")
    if (!globals.has(globalsFile)) {
      globals.set(globalsFile, globalNames(globalsFile))
    }
    const declared = declaredNames(parse(modulePath, snippet.code))
    const imported = snippet.selfContained
      ? []
      : [...globals.get(globalsFile)]
          .filter(([name]) => !declared.has(name))
          .map(([name, kind]) => (kind === "type" ? `type ${name}` : name))
    const specifier = toPosix(
      relative(dirname(modulePath), globalsFile)
    ).replace(/\.ts$/, "")
    const prelude =
      imported.length > 0
        ? `import { ${imported.join(", ")} } from "${specifier}"\n`
        : ""

    writeFileSync(modulePath, prelude + snippet.code + "\n")
    snippet.offset = prelude === "" ? 0 : 1
    byModule.set(modulePath, snippet)
  }
  return byModule
}

/**
 * Compiles the snippets in one program and returns its diagnostics, each
 * mapped back to the Markdown line it came from.
 *
 * This drives the compiler API rather than `tsc`: `tsc` reports no type errors
 * at all while any file has a syntax error, so one malformed snippet would
 * hide every other failure. Here a snippet with a syntax error reports only
 * those, and every other snippet is still checked.
 */
function compile(project, byModule) {
  const { options, errors } = ts.convertCompilerOptionsFromJson(
    COMPILER_OPTIONS,
    project
  )
  if (errors.length > 0) {
    throw new Error(
      ts.flattenDiagnosticMessageText(errors[0].messageText, "\n")
    )
  }
  const reactServerTypes = realpathSync(
    join(rootDir, "packages", "react", "dist", "server.d.ts")
  )
  const host = ts.createCompilerHost(options)
  // `types` and the other lookups a program without a tsconfig makes start
  // from the current directory; make that the project, wherever this runs.
  host.getCurrentDirectory = () => project
  const cache = ts.createModuleResolutionCache(project, (name) => name, options)
  const snippetModule = (fileName) => ({
    resolvedModule: {
      resolvedFileName: fileName,
      extension: fileName.endsWith(".tsx") ? ts.Extension.Tsx : ts.Extension.Ts,
      isExternalLibraryImport: false,
    },
  })
  host.resolveModuleNameLiterals = (
    literals,
    containingFile,
    redirectedReference,
    compilerOptions,
    containingSourceFile
  ) =>
    literals.map((literal) => {
      const snippet = byModule.get(containingFile)
      // TypeScript reads the `types` condition before `react-server`, so it
      // types a server component's import with the main entry, hooks and all.
      // Next.js resolves the `react-server` entry, where a hook is a missing
      // export; type a server snippet's import with that entry too.
      if (snippet?.server && literal.text === "@ic-reactor/react") {
        return {
          resolvedModule: {
            resolvedFileName: reactServerTypes,
            extension: ts.Extension.Dts,
            isExternalLibraryImport: true,
          },
        }
      }
      const resolved = ts.resolveModuleName(
        literal.text,
        containingFile,
        compilerOptions,
        host,
        cache,
        redirectedReference,
        ts.getModeForUsageLocation(
          containingSourceFile,
          literal,
          compilerOptions
        )
      )
      if (
        resolved.resolvedModule ||
        !snippet ||
        !literal.text.startsWith(".")
      ) {
        return resolved
      }
      const shown = findPageModule(byModule, snippet, literal.text)
      if (shown) return snippetModule(shown)
      const fixture = findFixture(project, snippet.context, literal.text)
      return fixture ? snippetModule(fixture) : resolved
    })

  const program = ts.createProgram({
    rootNames: [join(project, "fixtures", "ambient.d.ts"), ...byModule.keys()],
    options,
    host,
  })

  const found = [
    ...program.getOptionsDiagnostics(),
    ...program.getGlobalDiagnostics(),
  ]
  for (const sourceFile of program.getSourceFiles()) {
    if (!sourceFile.fileName.startsWith(toPosix(project) + "/")) continue
    if (sourceFile.fileName.includes("/node_modules/")) continue
    const syntactic = program.getSyntacticDiagnostics(sourceFile)
    found.push(
      ...(syntactic.length > 0
        ? syntactic
        : program.getSemanticDiagnostics(sourceFile))
    )
  }

  return found.map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(
      diagnostic.messageText,
      "\n    "
    )
    const code = `TS${diagnostic.code}`
    if (!diagnostic.file || diagnostic.start === undefined) {
      return { snippet: undefined, where: "", code, message }
    }
    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
      diagnostic.start
    )
    const snippet = byModule.get(diagnostic.file.fileName)
    if (!snippet) {
      const file = toPosix(relative(project, diagnostic.file.fileName))
      return {
        snippet: undefined,
        where: `${file.replace(/^fixtures\//, "scripts/check-snippets/")}:${line + 1}:${character + 1}`,
        code,
        message,
      }
    }
    // An error on the added import line names a global the snippet shadows
    // or misuses; report it on the snippet's first line.
    const row = Math.max(line - snippet.offset, 0)
    return {
      snippet,
      where: `${snippet.file}:${snippet.line + row}:${character + 1}`,
      code,
      message,
    }
  })
}

// ── Main ─────────────────────────────────────────────────────────────────────

const matches = (file) =>
  filters.length === 0 || filters.some((filter) => file.includes(filter))
const snippets = [
  ...collectSnippets(gatedFiles().filter(matches), false),
  ...(includeDocs ? collectSnippets(docsFiles().filter(matches), true) : []),
]

// Its real path: TypeScript names the files it reads by theirs, and a
// temporary directory can sit behind a symlink (/var -> /private/var on macOS).
const project = realpathSync(
  mkdtempSync(join(tmpdir(), "ic-reactor-snippets-"))
)
let links = []
let exitCode = 1
try {
  links = linkPackages(project)
  cpSync(fixturesDir, join(project, "fixtures"), { recursive: true })
  const byModule = writeSnippets(
    project,
    snippets.filter((snippet) => !snippet.skipped)
  )
  const diagnostics = compile(project, byModule)

  const failed = new Set(diagnostics.map((d) => d.snippet).filter(Boolean))
  const fixtureErrors = diagnostics.filter((d) => !d.snippet)

  if (verbose) {
    for (const snippet of snippets) {
      const state = snippet.skipped
        ? "skip"
        : failed.has(snippet)
          ? "FAIL"
          : "ok  "
      // The line of the opening fence
      console.log(`${state} ${snippet.file}:${snippet.line - 1}`)
    }
    console.log("")
  }
  for (const { snippet, where, code, message } of diagnostics) {
    const tag = snippet?.docs ? " (docs, not gated)" : ""
    console.log(`${where ? `${where} ` : ""}${code}${tag}: ${message}`)
  }
  if (diagnostics.length > 0) console.log("")

  const report = (label, list) => {
    const failures = list.filter((s) => failed.has(s)).length
    const skipped = list.filter((s) => s.skipped).length
    console.log(
      `${label}: ${list.length - skipped} checked (${list.length - skipped - failures} passed, ${failures} failed), ${skipped} skipped`
    )
    return failures
  }
  const gatedFailures = report(
    "Guides, skills and READMEs",
    snippets.filter((s) => !s.docs)
  )
  if (includeDocs) {
    report(
      "Docs pages (reported, not gated)",
      snippets.filter((s) => s.docs)
    )
  }

  if (fixtureErrors.length > 0) {
    console.error(
      "✖ The snippets' app in scripts/check-snippets/ does not compile."
    )
  } else if (gatedFailures > 0) {
    console.error(
      "✖ Fix each failing snippet in its file. Only a name the snippet's app would define belongs in scripts/check-snippets/; a deliberate fragment is marked ```ts nocheck."
    )
  } else {
    exitCode = 0
    console.log("✔ Every checked snippet compiles")
  }
} catch (error) {
  console.error(`✖ ${error.stack ?? error.message}`)
} finally {
  if (keep) {
    console.log(`  project kept at ${project}`)
  } else {
    for (const link of links) unlinkSync(link)
    rmSync(project, { recursive: true, force: true })
  }
}
// Not process.exit(): it can cut off output still being written to a pipe.
process.exitCode = exitCode
