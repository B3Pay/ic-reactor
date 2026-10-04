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
 *   1. copies its git-tracked files to a directory outside the repository;
 *   2. refuses a `workspace:`, `file:`, `link:` or `portal:` range, which no
 *      standalone install resolves, and checks each @ic-reactor/* range is
 *      satisfied by the version npm's `beta` dist-tag names (asking npm, so
 *      its own semver decides);
 *   3. installs from the npm registry with npm (no workspace, no links, no
 *      lockfile of ours), with an environment that holds nothing of the
 *      repository: no `npm_*` or `pnpm_*` variable a `pnpm run` set, and no
 *      PATH entry inside the repository;
 *   4. checks every installed @ic-reactor/* package is a real directory, not
 *      a symlink, at exactly the `beta` version;
 *   5. runs the example's `typecheck`, `test` and `build` scripts where they
 *      exist, as the examples job does (a Next example gets the same
 *      `next-env.d.ts` shim `typecheck-examples.js` writes);
 *   6. runs the `startCommand` of its `.stackblitzrc`, the command StackBlitz
 *      runs after its install: `npm run dev` is started, its first page
 *      fetched and the server stopped; a command already run in step 5 is not
 *      run twice; any other command must exit 0.
 *
 * Every example's tests run without a replica (each is a `createTestClient()`
 * over an in-memory one), so nothing here starts a network. The vite-wallet
 * example needs icp-cli's local network to run the wallet itself, which is why
 * its `.stackblitzrc` runs its tests instead of its dev server.
 *
 * Usage: node scripts/test-examples-published.mjs [--keep] [<example> ...]
 *   --keep     leave the copies on disk and print where they are
 *   <example>  a directory under examples/ (default: every example)
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

/** `npm test` and `npm run test` are the same script; so for the others. */
export function scriptOf(command) {
  const match = command.match(/^npm\s+(?:run(?:-script)?\s+)?([\w:-]+)$/)
  if (!match) return undefined
  return match[1] === "t" ? "test" : match[1]
}

/**
 * The same-origin scripts a page loads, as absolute URLs.
 *
 * @param {string} html
 * @param {string} pageUrl
 * @returns {string[]}
 */
export function pageScripts(html, pageUrl) {
  const origin = new URL(pageUrl).origin
  const urls = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)]
    .map((match) => new URL(match[1].replaceAll("&amp;", "&"), pageUrl))
    .filter((url) => url.origin === origin)
    .map((url) => url.href)
  return [...new Set(urls)]
}

/** The version a dist-tag names, from the registry. */
function distTagVersion(name, tag) {
  return execFileSync(
    "npm",
    ["view", `${name}@${tag}`, "version", `--registry=${REGISTRY}`],
    { encoding: "utf8", env: isolatedEnv(process.env, repoRoot) }
  ).trim()
}

/** The published versions of `name` that `range` accepts, from the registry. */
function npmSatisfying(name, range) {
  const result = spawnSync(
    "npm",
    ["view", `${name}@${range}`, "version", "--json", `--registry=${REGISTRY}`],
    { encoding: "utf8", env: isolatedEnv(process.env, repoRoot) }
  )
  if (result.status !== 0) {
    if (/E404/.test(result.stdout + result.stderr)) return []
    throw new Error(
      `npm view ${name}@${range} failed: ${result.stderr || result.stdout}`
    )
  }
  const parsed = JSON.parse(result.stdout || "[]")
  return Array.isArray(parsed) ? parsed : [parsed]
}

/** Copies the example's git-tracked files to `dest`. */
function copyTracked(name, dest) {
  const prefix = `examples/${name}`
  const files = execFileSync(
    "git",
    ["-C", repoRoot, "ls-files", "-z", "--", prefix],
    { encoding: "utf8" }
  )
    .split("\0")
    .filter(Boolean)
  for (const file of files) {
    const source = join(repoRoot, file)
    if (!existsSync(source)) continue
    const target = join(dest, relative(prefix, file))
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

/**
 * Starts `npm run dev` on a free port, fetches its first page and stops it.
 * The port is passed as `--port`, which both Vite and Next take, so a server
 * already on the example's own port on this machine does not fail the run.
 */
async function smokeDevServer(cwd, env, timeoutMs = 4 * MINUTE) {
  const port = await freePort()
  const url = `http://localhost:${port}/`
  const args = ["run", "dev", "--", "--port", String(port)]
  console.log(`\n  ▶ start: npm ${args.join(" ")}, then GET ${url}`)
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
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())),
        })
        const body = await response.text()
        if (response.ok && /<html[\s>]/i.test(body)) {
          // The page alone proves little for Vite, whose index.html is static:
          // its scripts are what the dev server compiles on request.
          const scripts = pageScripts(body, url)
          const broken = []
          for (const src of scripts) {
            const res = await fetch(src, {
              signal: AbortSignal.timeout(
                Math.max(1000, deadline - Date.now())
              ),
            })
            await res.arrayBuffer()
            if (!res.ok) broken.push(`${src} (${res.status})`)
          }
          if (broken.length > 0) {
            failure = `the page's scripts did not load: ${broken.join(", ")}`
            break
          }
          const ms = Date.now() - started
          console.log(
            `  ✓ ${url} answered ${response.status} with ${body.length} bytes of HTML, and its ${scripts.length} script(s) loaded, after ${seconds(ms)}`
          )
          return { ok: true, ms }
        }
        failure = `${url} answered ${response.status}${response.ok ? " without an <html> document" : ""}`
        if (!response.ok) break
      } catch {
        // not listening yet
      }
      await sleep(1000)
    }
  } finally {
    await killGroup(child)
  }
  const ms = Date.now() - started
  console.error(`  ✗ start failed: ${failure} after ${seconds(ms)}`)
  return { ok: false, ms }
}

/** One example, start to finish. */
async function testExample(name, { betaVersion, workDir }) {
  const dir = join(workDir, name.replaceAll("/", "__"))
  const steps = {}
  const findings = []
  console.log(`\n━━ ${name} → ${dir}`)

  const count = copyTracked(name, dir)
  console.log(`  copied ${count} tracked files`)

  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"))
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
    ["install", "--no-audit", "--no-fund", `--registry=${REGISTRY}`],
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
  console.log(
    `  installed from ${REGISTRY}: ` +
      installed.map((p) => `${p.name}@${p.version}`).join(", ")
  )
  if (findings.length > 0) return { name, steps, findings }

  const scripts = manifest.scripts ?? {}
  const isNext = Boolean(
    manifest.dependencies?.next || manifest.devDependencies?.next
  )
  if (isNext && !existsSync(join(dir, "next-env.d.ts"))) {
    writeFileSync(join(dir, "next-env.d.ts"), NEXT_ENV)
  }
  for (const script of ["typecheck", "test", "build"]) {
    if (!scripts[script]) continue
    steps[script] = runStep(script, "npm", ["run", script], dir, env)
  }

  const startScript = scriptOf(start.command)
  if (startScript === "dev") {
    steps.start = await smokeDevServer(dir, env)
  } else if (startScript && steps[startScript]) {
    console.log(
      `\n  ▶ start: ${start.command} (already run above as "${startScript}")`
    )
    steps.start = { ...steps[startScript], ran: startScript }
  } else {
    const [command, ...args] = start.command.split(/\s+/)
    steps.start = runStep("start", command, args, dir, env, 5 * MINUTE)
  }
  return { name, steps, findings }
}

function report(results, totalMs) {
  const columns = ["install", "typecheck", "test", "build", "start"]
  const cell = (step) =>
    !step
      ? "-"
      : `${step.ok ? "ok" : "FAIL"} ${step.ran ? `(= ${step.ran})` : seconds(step.ms)}`
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

async function main(argv) {
  const keep = argv.includes("--keep")
  const requested = argv.filter((arg) => !arg.startsWith("--"))
  const all = discoverExampleDirs()
  const unknown = requested.filter((name) => !all.includes(name))
  if (unknown.length > 0) {
    console.error(
      `Not an example: ${unknown.join(", ")} (examples: ${all.join(", ")})`
    )
    return 1
  }
  const names = requested.length > 0 ? requested : all
  if (names.length === 0) {
    console.error("No examples found under examples/.")
    return 1
  }

  const betaVersion = distTagVersion(`${SCOPE}core`, DIST_TAG)
  console.log(
    `${SCOPE}core@${DIST_TAG} is ${betaVersion} on ${REGISTRY}; testing ${names.join(", ")}`
  )

  const workDir = realpathSync(
    mkdtempSync(join(tmpdir(), "ic-reactor-published-examples-"))
  )
  const rel = relative(repoRoot, workDir)
  if (!rel.startsWith("..") && !rel.startsWith(sep)) {
    console.error(`The scratch directory ${workDir} is inside the repository.`)
    return 1
  }

  const started = Date.now()
  const results = []
  try {
    for (const name of names) {
      results.push(await testExample(name, { betaVersion, workDir }))
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
