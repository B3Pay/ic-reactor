#!/usr/bin/env node
/**
 * Runs every example against the @ic-reactor/* packages published on npm, the
 * way someone who copies the example out of this repository gets them, and the
 * way StackBlitz installs it.
 *
 * The examples job of CI runs the examples inside the workspace, where
 * `linkWorkspacePackages` links each @ic-reactor/* range to packages/*. That
 * proves the examples against the code on the branch, not against the release:
 * an example that uses a name the published beta lacks stays green there. This
 * script, for each example:
 *
 *   1. copies its git-tracked files to a directory outside the repository,
 *      and refuses to run if a parent of that directory holds a node_modules
 *      or a package.json (Node, Vite and vitest resolve a bare import by
 *      walking up into a parent's node_modules, so an undeclared import would
 *      be found there);
 *   2. refuses a `workspace:`, `file:`, `link:` or `portal:` range, which no
 *      standalone install resolves, and a tracked `.npmrc` (it could point the
 *      @ic-reactor scope at another registry, for this install and on
 *      StackBlitz); requires the `typecheck`, `test` and `build` scripts; and
 *      checks each @ic-reactor/* range is satisfied by the version npm's
 *      `beta` dist-tag names (asking npm, so its own semver decides);
 *   3. installs from registry.npmjs.org with npm (no workspace, no links, no
 *      lockfile of ours), the default registry and the @ic-reactor and
 *      @candid-core scopes all pinned to it on the command line, over any
 *      `.npmrc`, with an environment that holds nothing of the repository: no
 *      `npm_*` or `pnpm_*` variable a `pnpm run` set, and no PATH entry
 *      inside the repository;
 *   4. checks every installed @ic-reactor/* package is a real directory, not
 *      a symlink, at exactly the `beta` version, and that npm's lockfile
 *      records it as the registry's own tarball, with the integrity the
 *      registry publishes for that version (the proof the bytes are the
 *      published ones);
 *   5. runs the example's `typecheck`, `test` and `build` scripts, as the
 *      examples job does (a Next example gets the same `next-env.d.ts` shim
 *      `typecheck-examples.js` writes);
 *   6. runs the `startCommand` of its `.stackblitzrc`, the command StackBlitz
 *      runs after its install, under a model of what StackBlitz's WebContainer
 *      lacks (WEBCONTAINER_MODEL: no global `Iterator`, and an
 *      AsyncLocalStorage that keeps no store past the synchronous part of
 *      `run()`): `npm run dev [-- <args>]` is started, its first page fetched
 *      with every same-origin script on it and every app module those import,
 *      and the server stopped (a Next example with `NEXT_TEST_WASM=1`, so Next
 *      loads the WebAssembly bindings a WebContainer loads); any other command
 *      must exit 0, a script step 5 already ran on plain Node included.
 *
 * Every example's tests run without a replica (each is a `createTestClient()`
 * over an in-memory one), so nothing here starts a network. The vite-wallet
 * example needs icp-cli's local network to run the wallet itself, which is why
 * its `.stackblitzrc` runs its tests instead of its dev server. next-ssr's
 * runs its tests too: Next 16 renders no page in a WebContainer (see
 * WEBCONTAINER_MODEL).
 *
 * Usage: node scripts/test-examples-published.mjs [--keep] [--tmp <dir>]
 *          [--wait-for <version>] [<example> ...]
 *   --keep                 leave the copies on disk and print where they are
 *   --tmp <dir>            make the copies under <dir> (default: the OS tmpdir)
 *   --wait-for <version>   wait (up to 10 minutes) until the `beta` dist-tag
 *                          of core and of every @ic-reactor/* package the
 *                          examples declare names <version> (a leading "v" is
 *                          dropped), and the registry serves its integrity:
 *                          the release workflow runs this right after
 *                          publishing
 *   <example>              a directory under examples/ (default: every one)
 */
import { execFileSync, spawn, spawnSync } from "node:child_process"
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { delimiter, dirname, join, relative, resolve, sep } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { fileURLToPath } from "node:url"

import { discoverExampleDirs, root as repoRoot } from "./example-projects.js"

/** Where every install and every `npm view` goes, whatever ~/.npmrc says. */
export const REGISTRY = "https://registry.npmjs.org/"

/** The packages this repository publishes. */
export const SCOPE = "@ic-reactor/"

/** The dist-tag the v4 line publishes under (never `latest` before GA). */
export const DIST_TAG = "beta"

/** Range protocols that only resolve inside a workspace or on one disk. */
export const LOCAL_PROTOCOLS = ["workspace:", "file:", "link:", "portal:"]

/**
 * The scopes pinned to REGISTRY on every npm command. `--registry` replaces
 * only the default registry: a `@scope:registry=` setting in any `.npmrc`
 * (the user's, or one in the project) still wins for its scope.
 */
export const PINNED_SCOPES = ["@ic-reactor", "@candid-core"]

/** The registry flags of every npm command this script runs. */
export const REGISTRY_ARGS = [
  `--registry=${REGISTRY}`,
  ...PINNED_SCOPES.map((scope) => `--${scope}:registry=${REGISTRY}`),
]

/** The scripts every example must have: what the examples job runs. */
export const REQUIRED_SCRIPTS = ["typecheck", "test", "build"]

/**
 * Examples allowed to lack one of REQUIRED_SCRIPTS: { example: { script:
 * reason } }. Empty: all four have all three.
 */
export const SCRIPT_EXCEPTIONS = {}

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
]

/** Same shim as typecheck-examples.js: `next build` writes the real one. */
const NEXT_ENV = `/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n`

const MINUTE = 60_000

/**
 * A model of what StackBlitz's WebContainer lacks, as the examples' start
 * commands met it there (its `node --version` says v22.22.3), for a preload
 * that `--require` puts into every Node process the start command starts:
 *
 * - No global `Iterator`: `typeof Iterator` is "undefined" there, though Node
 *   22 defines it. jsdom 30.1 subclasses it, so all of vite-wallet's test
 *   files failed to start there with "ReferenceError: Iterator is not
 *   defined"; the examples pin jsdom 30.0.1.
 * - An AsyncLocalStorage whose store is gone once `run()` returns, and so
 *   after any await: StackBlitz says WebContainer does not implement
 *   AsyncLocalStorage (stackblitz/starters#122), and next-ssr's `next dev`
 *   answered 500 there with "Invariant: Expected workStore to be
 *   initialized". Under the model `next dev` fails with the same stack, and
 *   `next build --webpack` fails at its first prerender.
 *
 * Under this model each of the two failures happens here as it did on
 * StackBlitz, and what worked there (icrc-ledger's dev server, node-agent-tool's
 * demo) still works. It is the two gaps the examples have met, not a
 * WebContainer: a start command green under it can still meet another one.
 */
export const WEBCONTAINER_MODEL = `"use strict"
// Written by scripts/test-examples-published.mjs: see WEBCONTAINER_MODEL there.
delete globalThis.Iterator
class AsyncLocalStorage {
  #store = undefined
  getStore() {
    return this.#store
  }
  run(store, fn, ...args) {
    const outer = this.#store
    this.#store = store
    try {
      return fn(...args)
    } finally {
      this.#store = outer
    }
  }
  exit(fn, ...args) {
    return this.run(undefined, fn, ...args)
  }
  enterWith(store) {
    this.#store = store
  }
  disable() {
    this.#store = undefined
  }
  static bind(fn) {
    return fn
  }
  static snapshot() {
    return (fn, ...args) => fn(...args)
  }
}
Object.defineProperty(require("node:async_hooks"), "AsyncLocalStorage", {
  value: AsyncLocalStorage,
  writable: true,
  enumerable: true,
  configurable: true,
})
require("node:module").syncBuiltinESMExports()
`

/**
 * `env` with the preload at `preload` (WEBCONTAINER_MODEL) added to
 * NODE_OPTIONS, which every Node process the start command starts inherits:
 * vitest's workers and Next's servers included.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {string} preload
 * @returns {NodeJS.ProcessEnv}
 */
export function webContainerEnv(env, preload) {
  const option = `--require ${JSON.stringify(preload)}`
  return {
    ...env,
    NODE_OPTIONS: env.NODE_OPTIONS ? `${env.NODE_OPTIONS} ${option}` : option,
  }
}

/**
 * Every dependency a manifest declares, with the field it is declared in.
 *
 * @param {Record<string, any>} manifest
 * @returns {{ field: string, name: string, range: string }[]}
 */
export function declaredDependencies(manifest) {
  return DEPENDENCY_FIELDS.flatMap((field) =>
    Object.entries(manifest[field] ?? {}).map(([name, range]) => ({
      field,
      name,
      range: String(range),
    }))
  )
}

/**
 * What stops this manifest from installing standalone against the published
 * beta. `satisfying(name, range)` resolves with the published versions of
 * `name` the range accepts (npm's answer, in the script).
 *
 * @param {Record<string, any>} manifest
 * @param {{
 *   betaVersion: string,
 *   satisfying: (name: string, range: string) => Promise<string[]> | string[],
 * }} options
 * @returns {Promise<string[]>}
 */
export async function checkManifest(manifest, { betaVersion, satisfying }) {
  const findings = []
  for (const { field, name, range } of declaredDependencies(manifest)) {
    const protocol = LOCAL_PROTOCOLS.find((p) => range.startsWith(p))
    if (protocol) {
      findings.push(
        `${field}.${name} is "${range}": a ${protocol} range resolves only inside this repository, never in a standalone install or on StackBlitz`
      )
      continue
    }
    if (!name.startsWith(SCOPE)) continue
    const versions = await satisfying(name, range)
    if (!versions.includes(betaVersion)) {
      findings.push(
        `${field}.${name} is "${range}", which ${DIST_TAG} (${betaVersion}) does not satisfy` +
          (versions.length > 0
            ? `: npm would install ${versions.at(-1)}`
            : ": no published version satisfies it")
      )
    }
  }
  return findings
}

/**
 * Whether the examples wait on a release that is not published yet, so that
 * a run without `--wait-for` has nothing it can test. That is so when the
 * branch's own version (`packages/core/package.json`, which `release.js`
 * bumps, syncing every example to `^<version>`) is not among the registry's
 * versions, and every @ic-reactor/* range of every example is exactly
 * `^<version>`: a release pull request, or its merge before the tag publishes
 * it. No published version can satisfy those ranges yet, and `release.yml`'s
 * `examples-published` job tests the examples with `--wait-for` once the
 * release is out. Any other range, a local protocol included, is checked as
 * usual and fails as usual.
 *
 * @param {Record<string, any>[]} manifests the examples' package.json files
 * @param {{ branchVersion: string | undefined, publishedVersions: string[] }} state
 * @returns {boolean}
 */
export function awaitsRelease(manifests, { branchVersion, publishedVersions }) {
  if (!branchVersion || publishedVersions.includes(branchVersion)) return false
  const ranges = manifests.flatMap((manifest) =>
    declaredDependencies(manifest)
      .filter(({ name }) => name.startsWith(SCOPE))
      .map(({ range }) => range)
  )
  return (
    ranges.length > 0 && ranges.every((range) => range === `^${branchVersion}`)
  )
}

/**
 * The @ic-reactor/* packages installed in `projectDir`, and what is wrong with
 * them: one the manifest declares that is missing, a symlink (a link into a
 * workspace, not a package from the registry), or a version other than
 * `expectedVersion`.
 *
 * @param {string} projectDir
 * @param {string[]} declared the @ic-reactor/* names the manifest declares
 * @param {string} expectedVersion
 * @returns {{ installed: { name: string, version: string }[], findings: string[] }}
 */
export function checkInstalled(projectDir, declared, expectedVersion) {
  const scopeDir = join(projectDir, "node_modules", SCOPE.slice(0, -1))
  const present = existsSync(scopeDir)
    ? readdirSync(scopeDir).map((entry) => `${SCOPE}${entry}`)
    : []
  const names = [...new Set([...declared, ...present])].sort()
  const installed = []
  const findings = []
  for (const name of names) {
    const dir = join(projectDir, "node_modules", name)
    let stat
    try {
      stat = lstatSync(dir)
    } catch {
      findings.push(`${name} is declared but not installed`)
      continue
    }
    if (stat.isSymbolicLink()) {
      findings.push(
        `${name} is a symlink (to ${realpathSync(dir)}), not a package installed from the registry`
      )
      continue
    }
    if (!stat.isDirectory()) {
      findings.push(`${name} is not a directory`)
      continue
    }
    let version
    try {
      version = JSON.parse(
        readFileSync(join(dir, "package.json"), "utf8")
      ).version
    } catch {
      findings.push(`${name} has no readable package.json`)
      continue
    }
    installed.push({ name, version })
    if (version !== expectedVersion) {
      findings.push(
        `${name} installed at ${version}, not ${expectedVersion} (${DIST_TAG})`
      )
    }
  }
  return { installed, findings }
}

/** The @ic-reactor/* entries of a lockfile's `packages`, nested ones too. */
export function lockedScopePackages(lock) {
  const scope = SCOPE.slice(0, -1)
  return Object.entries(lock?.packages ?? {})
    .map(([path, entry]) => {
      const match = path.match(/(?:^|\/)node_modules\/(@[^/]+\/[^/]+)$/)
      return match && match[1].startsWith(`${scope}/`)
        ? { path, name: match[1], entry }
        : undefined
    })
    .filter(Boolean)
}

/**
 * What shows that an @ic-reactor/* package npm installed is not the registry's
 * published tarball: a lockfile entry that is a link, whose `resolved` is not
 * the tarball the registry names for that version, or whose `integrity` is not
 * the one it publishes. Also an installed package the lockfile does not
 * record. `published` is the registry's `dist` for each name at the beta.
 *
 * @param {Record<string, any> | undefined} lock package-lock.json
 * @param {{
 *   installed: string[],
 *   published: Record<string, { tarball: string, integrity: string }>,
 * }} options
 * @returns {string[]}
 */
export function checkLockfile(lock, { installed, published }) {
  if (!lock || typeof lock.packages !== "object") {
    return [
      "npm wrote no package-lock.json with a `packages` map, so where the @ic-reactor/* packages came from is unproven",
    ]
  }
  const findings = []
  const entries = lockedScopePackages(lock)
  for (const name of installed) {
    if (!entries.some((e) => e.path === `node_modules/${name}`)) {
      findings.push(
        `${name} is installed but package-lock.json does not record it`
      )
    }
  }
  for (const { path, name, entry } of entries) {
    const dist = published[name]
    if (entry.link) {
      findings.push(
        `${path} is a link (to ${entry.resolved}) in package-lock.json, not a tarball from the registry`
      )
      continue
    }
    if (!dist) {
      findings.push(
        `${path} is ${entry.version}: the registry's tarball for it was not looked up`
      )
      continue
    }
    if (entry.resolved !== dist.tarball || !dist.tarball.startsWith(REGISTRY)) {
      findings.push(
        `${path} was resolved from ${entry.resolved ?? "nowhere"}, not ${dist.tarball}`
      )
    }
    if (entry.integrity !== dist.integrity) {
      findings.push(
        `${path} has integrity ${entry.integrity ?? "(none)"}, not the registry's ${dist.integrity}`
      )
    }
  }
  return findings
}

/**
 * The example's tracked files that change how npm resolves its packages: a
 * `.npmrc` can point a scope at another registry, for the install here and
 * for StackBlitz's.
 *
 * @param {string[]} files paths relative to the example
 * @returns {string[]}
 */
export function trackedConfigFindings(files) {
  return files
    .filter((file) => file.split("/").at(-1) === ".npmrc")
    .map(
      (file) =>
        `${file} is tracked: an example's .npmrc could point @ic-reactor/* at another registry, here and on StackBlitz, so none is allowed`
    )
}

/**
 * The required scripts an example lacks, unless `exceptions` names them.
 *
 * @param {string} example
 * @param {Record<string, string> | undefined} scripts
 * @param {Record<string, Record<string, string>>} [exceptions]
 * @returns {string[]}
 */
export function requiredScriptFindings(
  example,
  scripts,
  exceptions = SCRIPT_EXCEPTIONS
) {
  return REQUIRED_SCRIPTS.filter(
    (script) => !scripts?.[script] && !exceptions[example]?.[script]
  ).map(
    (script) =>
      `package.json has no "${script}" script: every example runs typecheck, test and build here (an exception goes in SCRIPT_EXCEPTIONS, with its reason)`
  )
}

/**
 * The parents of `dir` holding a node_modules or a package.json, from which
 * Node, Vite or vitest would resolve an import the example does not declare.
 * Walks up to the filesystem root, or to `stopAt` (included).
 *
 * @param {string} dir
 * @param {{ stopAt?: string }} [options]
 * @returns {string[]}
 */
export function ancestorFindings(dir, { stopAt } = {}) {
  const findings = []
  let current = resolve(dir)
  const last = stopAt === undefined ? undefined : resolve(stopAt)
  while (current !== last) {
    const parent = dirname(current)
    if (parent === current) break
    current = parent
    for (const entry of ["node_modules", "package.json"]) {
      if (existsSync(join(current, entry))) {
        findings.push(
          `${join(current, entry)} is above the scratch directory: an import the example does not declare would resolve there (pass --tmp <dir> with no node_modules or package.json above it)`
        )
      }
    }
  }
  return findings
}

/**
 * A child environment that holds nothing of this repository. A `pnpm run`
 * sets `npm_*` variables (the workspace's config and package among them) and
 * puts the repository's `node_modules/.bin` on PATH, where a binary the
 * example failed to install would still be found.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {string} root the repository root
 * @returns {NodeJS.ProcessEnv}
 */
export function isolatedEnv(env, root) {
  const inside = (entry) => {
    const rel = relative(root, resolve(entry))
    return rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep))
  }
  const out = {}
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue
    if (/^(npm|pnpm)_/i.test(key)) continue
    if (["NODE_PATH", "INIT_CWD", "PNPM_SCRIPT_SRC_DIR"].includes(key)) continue
    out[key] = value
  }
  out.PATH = (env.PATH ?? "")
    .split(delimiter)
    .filter((entry) => entry && !inside(entry))
    .join(delimiter)
  out.npm_config_registry = REGISTRY
  out.npm_config_update_notifier = "false"
  return out
}

/**
 * The command StackBlitz runs after installing, from `.stackblitzrc`.
 *
 * @param {string} projectDir
 * @returns {{ command?: string, finding?: string }}
 */
export function stackblitzStartCommand(projectDir) {
  const file = join(projectDir, ".stackblitzrc")
  if (!existsSync(file)) {
    return {
      finding:
        ".stackblitzrc is missing: StackBlitz's own choice of start command is not checked here, so each example names its own",
    }
  }
  let config
  try {
    config = JSON.parse(readFileSync(file, "utf8"))
  } catch (error) {
    return { finding: `.stackblitzrc is not JSON: ${error.message}` }
  }
  if (typeof config.startCommand !== "string" || !config.startCommand.trim()) {
    return { finding: ".stackblitzrc has no startCommand string" }
  }
  return { command: config.startCommand.trim() }
}

/**
 * The package script a start command runs, and the arguments it passes after
 * `--`. `npm test` and `npm run test` are the same script; so for the others.
 *
 * @param {string} command
 * @returns {{ script: string, args: string[] } | undefined}
 */
export function parseNpmCommand(command) {
  const match = command.match(
    /^npm\s+(?:run(?:-script)?\s+)?([\w:-]+)(?:\s+--((?:\s+\S+)*))?\s*$/
  )
  if (!match) return undefined
  const script = match[1] === "t" ? "test" : match[1]
  if (script === "run" || script === "run-script") return undefined
  const args = (match[2] ?? "").split(/\s+/).filter(Boolean)
  return { script, args }
}

/**
 * The same-origin scripts a page loads, as absolute URLs, each with whether it
 * is an ES module (`type="module"`).
 *
 * @param {string} html
 * @param {string} pageUrl
 * @returns {{ url: string, module: boolean }[]}
 */
export function pageScripts(html, pageUrl) {
  const origin = new URL(pageUrl).origin
  const seen = new Set()
  const scripts = []
  for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
    const src = match[1].match(/\bsrc="([^"]+)"/i)?.[1]
    if (!src) continue
    const url = new URL(src.replaceAll("&amp;", "&"), pageUrl)
    if (url.origin !== origin || seen.has(url.href)) continue
    seen.add(url.href)
    scripts.push({
      url: url.href,
      module: /\btype=["']?module\b/i.test(match[1]),
    })
  }
  return scripts
}

/**
 * The app modules an ES module served by a dev server imports, as absolute
 * URLs: its static `import`/`export ... from` and string `import()`
 * specifiers on its own origin. Pre-bundled dependencies (`/node_modules/`)
 * and the dev server's own modules (`/@vite/client`, `/@id/...`) are left out:
 * they are not the example's code, and a dependency re-optimisation could
 * answer them 504 while it runs.
 *
 * @param {string} code
 * @param {string} moduleUrl
 * @returns {string[]}
 */
export function moduleImports(code, moduleUrl) {
  const origin = new URL(moduleUrl).origin
  const specifiers = [
    ...code.matchAll(
      /^[ \t]*(?:import|export)[ \t\n{*][^'"`;]*?\bfrom[ \t]*["']([^"'\n]+)["']/gm
    ),
    ...code.matchAll(/^[ \t]*import[ \t]*["']([^"'\n]+)["']/gm),
    ...code.matchAll(/\bimport\([ \t]*["']([^"'\n]+)["'][ \t]*\)/g),
  ].map((match) => match[1])
  const urls = new Set()
  for (const specifier of specifiers) {
    if (!/^(?:\/|\.\.?\/)/.test(specifier)) continue
    const url = new URL(specifier, moduleUrl)
    if (url.origin !== origin) continue
    if (/^\/(?:node_modules\/|@)/.test(url.pathname)) continue
    urls.add(url.href)
  }
  return [...urls]
}

/** `npm view <spec> <field> --json`, from the registry; undefined on E404. */
function npmView(spec, field) {
  const result = spawnSync(
    "npm",
    ["view", spec, field, "--json", ...REGISTRY_ARGS],
    { encoding: "utf8", env: isolatedEnv(process.env, repoRoot) }
  )
  if (result.status !== 0) {
    if (/E404/.test(result.stdout + result.stderr)) return undefined
    throw new Error(
      `npm view ${spec} ${field} failed: ${result.stderr || result.stdout}`
    )
  }
  return result.stdout.trim() ? JSON.parse(result.stdout) : undefined
}

/** The version a dist-tag names, from the registry. */
function distTagVersion(name, tag) {
  const version = npmView(`${name}@${tag}`, "version")
  if (typeof version !== "string") {
    throw new Error(`${name} has no ${tag} dist-tag on ${REGISTRY}`)
  }
  return version
}

/** The published versions of `name` that `range` accepts, from the registry. */
function npmSatisfying(name, range) {
  const parsed = npmView(`${name}@${range}`, "version")
  if (parsed === undefined) return []
  return Array.isArray(parsed) ? parsed : [parsed]
}

/** The registry's tarball URL and integrity for each name at `version`. */
function publishedDist(names, version) {
  const out = {}
  for (const name of names) {
    const dist = npmView(`${name}@${version}`, "dist")
    if (dist?.tarball && dist?.integrity) {
      out[name] = { tarball: dist.tarball, integrity: dist.integrity }
    }
  }
  return out
}

/** The example's git-tracked files, relative to it. */
function trackedFiles(name) {
  const prefix = `examples/${name}`
  return execFileSync("git", ["-C", repoRoot, "ls-files", "-z", "--", prefix], {
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
    .map((file) => relative(prefix, file))
}

/** Copies the example's git-tracked files to `dest`. */
function copyTracked(name, files, dest) {
  const prefix = join(repoRoot, "examples", name)
  for (const file of files) {
    const source = join(prefix, file)
    if (!existsSync(source)) continue
    const target = join(dest, file)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(source, target)
  }
  return files.length
}

function seconds(ms) {
  return `${(ms / 1000).toFixed(1)}s`
}

/** Runs one command with its output shown, and times it. */
function runStep(label, command, args, cwd, env, timeoutMs = 15 * MINUTE) {
  console.log(`\n  ▶ ${label}: ${[command, ...args].join(" ")}`)
  const started = Date.now()
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: "inherit",
    timeout: timeoutMs,
    killSignal: "SIGKILL",
  })
  const ms = Date.now() - started
  const ok = result.status === 0
  if (!ok) {
    const why = result.error
      ? result.error.message
      : result.signal
        ? `killed by ${result.signal}`
        : `exit ${result.status}`
    console.error(`  ✗ ${label} failed (${why}) after ${seconds(ms)}`)
  }
  return { ok, ms }
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.unref()
    server.on("error", reject)
    server.listen(0, () => {
      const { port } = server.address()
      server.close(() => resolvePort(port))
    })
  })
}

/** Ends a detached child and everything it started. */
async function killGroup(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise((done) => child.once("exit", done))
  try {
    process.kill(-child.pid, "SIGTERM")
  } catch {
    return
  }
  const timedOut = await Promise.race([
    exited.then(() => false),
    sleep(5000).then(() => true),
  ])
  if (timedOut) {
    try {
      process.kill(-child.pid, "SIGKILL")
    } catch {
      // already gone
    }
    await exited
  }
}

/** At most this many app modules are fetched from one dev server. */
const MODULE_LIMIT = 500

/**
 * Fetches the page's scripts and, from each ES module among them, every app
 * module it imports, transitively: a Vite dev server compiles a module only
 * when it is requested, so a module below the entry that fails to transform
 * (an unresolvable import, say) answers 500 only when fetched.
 */
async function loadScripts(scripts, deadline) {
  const queue = scripts.map((s) => ({ ...s, from: "the page" }))
  const seen = new Set(queue.map((s) => s.url))
  const broken = []
  let modules = 0
  while (queue.length > 0) {
    const { url, module, from } = queue.shift()
    const res = await fetch(url, {
      signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())),
    })
    const code = await res.text()
    if (!res.ok) {
      broken.push(`${url} (${res.status}, imported by ${from})`)
      continue
    }
    if (!module) continue
    modules++
    for (const next of moduleImports(code, url)) {
      if (seen.has(next) || seen.size >= MODULE_LIMIT) continue
      seen.add(next)
      queue.push({ url: next, module: true, from: url })
    }
  }
  return { broken, fetched: seen.size, modules }
}

/**
 * Starts `npm run dev -- <args> --port N` on a free port, fetches its first
 * page and what that page loads, and stops it. The port is passed as
 * `--port`, which both Vite and Next take, so a server already on the
 * example's own port on this machine does not fail the run.
 */
async function smokeDevServer(cwd, env, extraArgs, timeoutMs = 4 * MINUTE) {
  const port = await freePort()
  const url = `http://localhost:${port}/`
  const args = ["run", "dev", "--", ...extraArgs, "--port", String(port)]
  const shown = env.NEXT_TEST_WASM ? "NEXT_TEST_WASM=1 " : ""
  console.log(
    `\n  ▶ start, under the WebContainer model: ${shown}npm ${args.join(" ")}, then GET ${url}`
  )
  const started = Date.now()
  const child = spawn("npm", args, {
    cwd,
    env,
    detached: true,
    stdio: ["ignore", "inherit", "inherit"],
  })
  let exit
  child.once("exit", (code, signal) => (exit = signal ?? `exit ${code}`))
  let failure = "no page before the deadline"
  try {
    const deadline = started + timeoutMs
    while (Date.now() < deadline) {
      if (exit) {
        failure = `the dev server stopped (${exit}) before serving a page`
        break
      }
      let response
      let body
      try {
        response = await fetch(url, {
          signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())),
        })
        body = await response.text()
      } catch {
        // not listening yet
        await sleep(1000)
        continue
      }
      if (response.ok && /<html[\s>]/i.test(body)) {
        // The page alone proves little for Vite, whose index.html is static:
        // its scripts, and the modules they import, are what the dev server
        // compiles on request.
        const scripts = pageScripts(body, url)
        const loaded = await loadScripts(scripts, deadline)
        if (loaded.broken.length > 0) {
          failure = `what the page loads did not load: ${loaded.broken.join(", ")}`
          break
        }
        const ms = Date.now() - started
        console.log(
          `  ✓ ${url} answered ${response.status} with ${body.length} bytes of HTML; its ${scripts.length} script(s) and the app modules they import loaded (${loaded.fetched} fetched, ${loaded.modules} ES modules), after ${seconds(ms)}`
        )
        return { ok: true, ms }
      }
      failure = `${url} answered ${response.status}${response.ok ? " without an <html> document" : ""}`
      if (!response.ok) break
      await sleep(1000)
    }
  } catch (error) {
    failure = error.message
  } finally {
    await killGroup(child)
  }
  const ms = Date.now() - started
  console.error(`  ✗ start failed: ${failure} after ${seconds(ms)}`)
  return { ok: false, ms }
}

/** One example, start to finish. */
async function testExample(name, { betaVersion, workDir, preload }) {
  const dir = join(workDir, name.replaceAll("/", "__"))
  const steps = {}
  const findings = []
  console.log(`\n━━ ${name} → ${dir}`)

  const files = trackedFiles(name)
  copyTracked(name, files, dir)
  console.log(`  copied ${files.length} tracked files`)

  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"))
  findings.push(...trackedConfigFindings(files))
  findings.push(...requiredScriptFindings(name, manifest.scripts))
  findings.push(
    ...(await checkManifest(manifest, {
      betaVersion,
      satisfying: npmSatisfying,
    }))
  )
  const start = stackblitzStartCommand(dir)
  if (start.finding) findings.push(start.finding)
  if (findings.length > 0) return { name, steps, findings }

  const env = isolatedEnv(process.env, repoRoot)
  steps.install = runStep(
    "install",
    "npm",
    [
      "install",
      "--no-audit",
      "--no-fund",
      "--package-lock=true",
      ...REGISTRY_ARGS,
    ],
    dir,
    env
  )
  if (!steps.install.ok) return { name, steps, findings }

  const declared = declaredDependencies(manifest)
    .map((d) => d.name)
    .filter((n) => n.startsWith(SCOPE))
  const { installed, findings: installFindings } = checkInstalled(
    dir,
    declared,
    betaVersion
  )
  findings.push(...installFindings)
  let lock
  try {
    lock = JSON.parse(readFileSync(join(dir, "package-lock.json"), "utf8"))
  } catch {
    lock = undefined
  }
  const locked = [...new Set(lockedScopePackages(lock).map((e) => e.name))]
  findings.push(
    ...checkLockfile(lock, {
      installed: installed.map((p) => p.name),
      published: publishedDist(locked, betaVersion),
    })
  )
  console.log(
    `  installed from ${REGISTRY} (lockfile resolved and integrity match the registry's): ` +
      installed.map((p) => `${p.name}@${p.version}`).join(", ")
  )
  if (findings.length > 0) return { name, steps, findings }

  const isNext = Boolean(
    manifest.dependencies?.next || manifest.devDependencies?.next
  )
  if (isNext && !existsSync(join(dir, "next-env.d.ts"))) {
    writeFileSync(join(dir, "next-env.d.ts"), NEXT_ENV)
  }
  for (const script of REQUIRED_SCRIPTS) {
    if (!manifest.scripts?.[script]) continue
    steps[script] = runStep(script, "npm", ["run", script], dir, env)
  }

  // Under the model of what a WebContainer lacks, even a script step 5 ran:
  // green on Node says nothing about StackBlitz (vite-wallet's tests were).
  const modelEnv = webContainerEnv(env, preload)
  const parsed = parseNpmCommand(start.command)
  if (parsed?.script === "dev") {
    // A WebContainer has no native binary: Next loads its WebAssembly
    // bindings there, and NEXT_TEST_WASM makes it do the same here.
    const devEnv = isNext ? { ...modelEnv, NEXT_TEST_WASM: "1" } : modelEnv
    steps.start = await smokeDevServer(dir, devEnv, parsed.args)
  } else {
    const [command, ...args] = start.command.split(/\s+/)
    steps.start = runStep(
      "start, under the WebContainer model",
      command,
      args,
      dir,
      modelEnv,
      5 * MINUTE
    )
  }
  return { name, steps, findings }
}

function report(results, totalMs) {
  const columns = ["install", "typecheck", "test", "build", "start"]
  const cell = (step) =>
    !step ? "-" : `${step.ok ? "ok" : "FAIL"} ${seconds(step.ms)}`
  const rows = results.map((r) => {
    const failed =
      r.findings.length > 0 || Object.values(r.steps).some((s) => !s.ok)
    return [
      r.name,
      ...columns.map((c) => cell(r.steps[c])),
      failed ? "FAIL" : "ok",
    ]
  })
  const header = ["example", ...columns, "result"]
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => row[i].length))
  )
  const line = (row) => row.map((v, i) => v.padEnd(widths[i])).join("  ")
  console.log(
    `\n${line(header)}\n${widths.map((w) => "-".repeat(w)).join("  ")}`
  )
  for (const row of rows) console.log(line(row))
  for (const r of results) {
    for (const finding of r.findings) console.error(`\n✗ ${r.name}: ${finding}`)
  }
  console.log(`\nTotal ${seconds(totalMs)}`)
  return rows.some((row) => row.at(-1) === "FAIL")
}

/**
 * The command line: `--keep`, `--tmp <dir>`, `--wait-for <version>` and the
 * example names.
 *
 * @param {string[]} argv
 * @returns {{ keep: boolean, tmp?: string, waitFor?: string, names: string[], error?: string }}
 */
export function parseArgs(argv) {
  const out = { keep: false, names: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--keep") out.keep = true
    else if (arg === "--tmp" || arg === "--wait-for") {
      const value = argv[++i]
      if (!value || value.startsWith("--")) {
        return { ...out, error: `${arg} needs a value` }
      }
      if (arg === "--tmp") out.tmp = value
      else out.waitFor = value.replace(/^v/, "")
    } else if (arg.startsWith("--")) {
      return { ...out, error: `Unknown option ${arg}` }
    } else out.names.push(arg)
  }
  return out
}

/**
 * The @ic-reactor/* packages a run reads from the registry: every one the
 * manifests declare, and core (whose dist-tag names the beta under test).
 *
 * @param {Record<string, any>[]} manifests
 * @returns {string[]}
 */
export function scopePackageNames(manifests) {
  const names = new Set([`${SCOPE}core`])
  for (const manifest of manifests) {
    for (const { name } of declaredDependencies(manifest)) {
      if (name.startsWith(SCOPE)) names.add(name)
    }
  }
  return [...names].sort()
}

/**
 * Polls each package until its `tag` dist-tag names `version` and the
 * registry answers with `version`'s integrity, for up to `timeoutMs`. The
 * release workflow publishes core, react and vite-plugin one after another, so
 * the last one can lag the first by minutes; every package the run reads must
 * be served before the examples install.
 *
 * `lookup(name)` resolves with what the registry serves now: the version the
 * dist-tag names (undefined when it has none) and `version`'s integrity
 * (undefined when that version is not served yet).
 *
 * @param {string[]} names
 * @param {string} tag
 * @param {string} version
 * @param {{
 *   lookup: (name: string) => Promise<{ tagged?: string, integrity?: string }> | { tagged?: string, integrity?: string },
 *   timeoutMs?: number,
 *   pollMs?: number,
 *   wait?: (ms: number) => Promise<unknown>,
 *   now?: () => number,
 *   log?: (line: string) => void,
 * }} options
 * @returns {Promise<string>} `version`, once every package serves it
 */
export async function waitForPublished(
  names,
  tag,
  version,
  {
    lookup,
    timeoutMs = 10 * MINUTE,
    pollMs = 15_000,
    wait = sleep,
    now = Date.now,
    log = console.log,
  }
) {
  const deadline = now() + timeoutMs
  for (;;) {
    const pending = []
    for (const name of names) {
      const { tagged, integrity } = await lookup(name)
      if (tagged !== version) {
        pending.push(`${name}@${tag} is ${tagged ?? "unset"}`)
      } else if (!integrity) {
        pending.push(`${name}@${version} has no dist.integrity yet`)
      }
    }
    if (pending.length === 0) return version
    if (now() >= deadline) {
      throw new Error(
        `Not published as ${version} after ${seconds(timeoutMs)}: ${pending.join("; ")}`
      )
    }
    log(`Waiting for ${version}: ${pending.join("; ")}`)
    await wait(pollMs)
  }
}

/** What the registry serves for `name` now, for `waitForPublished`. */
function registryState(name, tag, version) {
  const tagged = npmView(`${name}@${tag}`, "version")
  const integrity =
    tagged === version
      ? npmView(`${name}@${version}`, "dist.integrity")
      : undefined
  return {
    tagged: typeof tagged === "string" ? tagged : undefined,
    integrity: typeof integrity === "string" ? integrity : undefined,
  }
}

async function main(argv) {
  const args = parseArgs(argv)
  if (args.error) {
    console.error(args.error)
    return 1
  }
  const all = discoverExampleDirs()
  const unknown = args.names.filter((name) => !all.includes(name))
  if (unknown.length > 0) {
    console.error(
      `Not an example: ${unknown.join(", ")} (examples: ${all.join(", ")})`
    )
    return 1
  }
  const names = args.names.length > 0 ? args.names : all
  if (names.length === 0) {
    console.error("No examples found under examples/.")
    return 1
  }

  const waitFor = args.waitFor
  const manifests = names.map((name) =>
    JSON.parse(
      readFileSync(join(repoRoot, "examples", name, "package.json"), "utf8")
    )
  )
  if (!waitFor) {
    const branchVersion = JSON.parse(
      readFileSync(join(repoRoot, "packages", "core", "package.json"), "utf8")
    ).version
    const versions = npmView(`${SCOPE}core`, "versions") ?? []
    const publishedVersions = Array.isArray(versions) ? versions : [versions]
    if (awaitsRelease(manifests, { branchVersion, publishedVersions })) {
      console.log(
        `The examples pin ^${branchVersion}, this branch's own version, which is not on ${REGISTRY} yet: ` +
          `a release that has not been published. release.yml's examples-published job tests them ` +
          `against it once it is (--wait-for v${branchVersion}). Nothing to test here.`
      )
      return 0
    }
  }
  const betaVersion = waitFor
    ? await waitForPublished(scopePackageNames(manifests), DIST_TAG, waitFor, {
        lookup: (pkg) => registryState(pkg, DIST_TAG, waitFor),
      })
    : distTagVersion(`${SCOPE}core`, DIST_TAG)
  console.log(
    `${SCOPE}core@${DIST_TAG} is ${betaVersion} on ${REGISTRY}; testing ${names.join(", ")}`
  )

  const base = realpathSync(args.tmp ? resolve(args.tmp) : tmpdir())
  const workDir = realpathSync(
    mkdtempSync(join(base, "ic-reactor-published-examples-"))
  )
  const rel = relative(repoRoot, workDir)
  const refusals = []
  if (!rel.startsWith("..") && !rel.startsWith(sep)) {
    refusals.push(`The scratch directory ${workDir} is inside the repository.`)
  }
  refusals.push(...ancestorFindings(workDir))
  if (refusals.length > 0) {
    rmSync(workDir, { recursive: true, force: true })
    for (const refusal of refusals) console.error(refusal)
    return 1
  }
  const keep = args.keep
  const preload = join(workDir, "webcontainer-model.cjs")
  writeFileSync(preload, WEBCONTAINER_MODEL)

  const started = Date.now()
  const results = []
  try {
    for (const name of names) {
      results.push(await testExample(name, { betaVersion, workDir, preload }))
    }
  } finally {
    if (keep) console.log(`\nCopies kept in ${workDir}`)
    else rmSync(workDir, { recursive: true, force: true })
  }
  const failed = report(results, Date.now() - started)
  if (!failed) {
    console.log(
      `✅ ${results.length} example(s) green against ${SCOPE}*@${betaVersion} from npm`
    )
  }
  return failed ? 1 : 0
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await main(process.argv.slice(2))
}
