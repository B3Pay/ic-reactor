#!/usr/bin/env node
/**
 * Verifies the artifacts we actually publish, the way a consumer receives them.
 *
 * Everything in-repo (examples, e2e, tests) reaches the packages through workspace
 * symlinks and bundler-mode resolution, so a package can be badly broken for real
 * consumers while every in-repo check stays green. That is how 3.7.0 shipped
 * `export * from "./reactor"` — extensionless specifiers that Node's ESM resolver
 * cannot load — and how @ic-reactor/cli shipped a `types` entry it never built.
 *
 * This script packs each publishable package, installs the tarballs into a scratch
 * project *outside* the workspace, and then:
 *   1. checks that each tarball ships the repository's LICENSE
 *   2. installs each package that has a command in a project of its own, and
 *      runs the command from there, as an MCP client or a shell would
 *   3. imports every entry point in real Node ESM
 *   4. requires every CJS entry point where one is declared
 *   5. runs `publint` over each tarball
 *   6. runs `attw` (Are The Types Wrong) over each tarball
 *
 * Usage: node scripts/verify-package-artifacts.mjs [--skip-attw] [--keep]
 */
import { execFileSync, spawn } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import {
  commandsOf,
  exportsMapOf,
  publicSubpaths,
  specifierOf,
} from "./lib/package-exports.mjs"
import { LANE_PACKAGES } from "./release-tag.mjs"

const ROOT = resolve(import.meta.dirname, "..")
const KEEP = process.argv.includes("--keep")
const SKIP_ATTW = process.argv.includes("--skip-attw")

// Publishable workspace packages, in dependency order: the release lane's,
// which publishes core before the packages that depend on it.
const PACKAGES = LANE_PACKAGES.map((name) => `packages/${name}`)

// Peers a consumer would install alongside them. Pinned loosely on purpose: this
// checks resolvability of our artifacts, not of the peer tree.
const PEERS = [
  "@icp-sdk/core@^6.0.0",
  "@tanstack/query-core@^5",
  "@tanstack/react-query@^5",
  "react@^19",
  "react-dom@^19",
]

/**
 * A package whose entire published surface is its executable: it declares `bin`
 * and deliberately declares no module a consumer can import. Either it has no
 * module entry at all, like the 3.x line's @ic-reactor/cli (which used to
 * point `main`/`types` at the shebang file, and at a 20-byte d.ts built from
 * it, advertising a module surface that does not exist), or its `exports` map
 * holds `./package.json` alone, like @ic-reactor/mcp, so that none of its
 * files can be imported. There is nothing here for the import check or attw
 * to look at; its commands are run instead.
 */
const isBinOnly = (m) =>
  Boolean(m.bin) &&
  (m.exports
    ? publicSubpaths(m).length === 0
    : !m.main && !m.module && !m.types && !m.typings)

/** The canister of the MCP server's check: a .did of one query and one update. */
const MCP_CHECK_DID = `service : {
  greet : (text) -> (text) query;
  set : (nat) -> ();
}
`

/**
 * An MCP client's first exchange with `command` over its stdin and stdout:
 * `initialize`, then `tools/list`. Resolves with the names of the tools it
 * lists and what it wrote to stderr, or rejects with what went wrong, within
 * `timeoutMs`.
 */
function listMcpTools(command, args, { cwd, timeoutMs = 30_000 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"] })
    let done = false
    let stdout = ""
    let stderr = ""
    const finish = (problem, tools) => {
      if (done) return
      done = true
      clearTimeout(timer)
      child.kill()
      if (problem === undefined) resolve({ tools, stderr: stderr.trim() })
      else reject(new Error(`${problem}\n${stderr.trim()}`))
    }
    const timer = setTimeout(
      () => finish(`no answer to tools/list within ${timeoutMs / 1000} s`),
      timeoutMs
    )
    const send = (message) =>
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`)
    child.on("error", (error) => finish(error.message))
    child.on("exit", (code, signal) =>
      finish(`it exited (${code ?? signal}) before it answered tools/list`)
    )
    child.stderr.on("data", (chunk) => (stderr += chunk))
    child.stdout.on("data", (chunk) => {
      stdout += chunk
      for (let end; (end = stdout.indexOf("\n")) >= 0;) {
        const line = stdout.slice(0, end).trim()
        stdout = stdout.slice(end + 1)
        if (line === "") continue
        let message
        try {
          message = JSON.parse(line)
        } catch {
          return finish(
            `it wrote a line that is not JSON: ${line.slice(0, 200)}`
          )
        }
        if (message.error !== undefined) {
          return finish(`it answered ${JSON.stringify(message.error)}`)
        }
        if (message.id === 1) {
          send({ method: "notifications/initialized" })
          send({ id: 2, method: "tools/list" })
        } else if (message.id === 2) {
          return finish(
            undefined,
            (message.result?.tools ?? []).map((tool) => tool.name)
          )
        }
      }
    })
    send({
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "verify-package-artifacts", version: "0" },
      },
    })
  })
}

/**
 * The packages whose root entry may export nothing for now. On the v4 line the
 * 3.x runtime was removed and the 4 API arrived slice by slice (#790), so core
 * and react published an empty entry until their first slice landed. Both
 * export their first names now, and the set is empty: an empty entry is a
 * broken artifact again, which is what this check exists to catch. A package
 * that has to publish an empty entry for a while is added here by name, and
 * dropped in the change that gives it its first export; the import check below
 * warns when a listed package already exports something, so a stale line does
 * not go unnoticed.
 */
const MAY_EXPORT_NOTHING = new Set()

/**
 * Whether a package's ROOT entry may export nothing: only the
 * packages listed above, and only while the line is an alpha prerelease. From
 * the first beta the allowance ends for them too.
 */
const mayExportNothing = (manifest) =>
  MAY_EXPORT_NOTHING.has(manifest.name) &&
  /-alpha\./.test(manifest.version ?? "")

const failures = []
function fail(pkg, what, detail) {
  failures.push({ pkg, what, detail })
  console.error(
    `  ✗ ${what}\n${String(detail)
      .split("\n")
      .slice(0, 12)
      .map((l) => `      ${l}`)
      .join("\n")}`
  )
}
function ok(what) {
  console.log(`  ✓ ${what}`)
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  })
}

const scratch = mkdtempSync(join(tmpdir(), "ic-reactor-verify-"))
// The projects a command's package is installed in alone. Not under `scratch`:
// Node looks for a module in every node_modules above a file, so one there
// would find what the shared project installed.
const apart = mkdtempSync(join(tmpdir(), "ic-reactor-verify-alone-"))
console.log(`scratch project: ${scratch}\n`)

try {
  // ── 1. Pack every publishable package ────────────────────────────────────────
  const tarballs = []
  for (const rel of PACKAGES) {
    const dir = join(ROOT, rel)
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"))
    if (manifest.private) continue
    // pnpm pack (not npm pack) rewrites `workspace:^` deps to real versions, which
    // is what the release workflow publishes. npm pack would leave them literal.
    run("pnpm", ["pack", "--pack-destination", scratch], { cwd: dir })
    const tgz = readdirSync(scratch).find(
      (f) => f.endsWith(".tgz") && !tarballs.some((t) => t.file === f)
    )
    if (!tgz) throw new Error(`pnpm pack produced no tarball for ${rel}`)
    tarballs.push({ name: manifest.name, file: tgz, manifest, dir })
    console.log(`packed ${manifest.name} -> ${tgz}`)
  }

  // ── 2. Install them into a scratch project outside the workspace ─────────────
  writeFileSync(
    join(scratch, "package.json"),
    JSON.stringify(
      { name: "verify-esm", private: true, version: "1.0.0", type: "module" },
      null,
      2
    )
  )
  console.log(
    `\ninstalling ${tarballs.length} tarballs + peers into scratch project...`
  )
  try {
    run(
      "npm",
      [
        "install",
        "--no-audit",
        "--no-fund",
        "--loglevel",
        "error",
        ...tarballs.map((t) => `./${t.file}`),
        ...PEERS,
      ],
      { cwd: scratch }
    )
  } catch (e) {
    console.error("install into scratch project failed:")
    console.error(
      String(e.stderr || e.stdout || e.message)
        .split("\n")
        .slice(0, 25)
        .join("\n")
    )
    process.exit(1)
  }
  console.log("installed\n")

  // ── 3. Import every entry point, and run every command, as a consumer would ─
  for (const { name, manifest, file } of tarballs) {
    console.log(`${name}`)

    // MIT asks for the notice to ship with every copy: each tarball carries the
    // repository's LICENSE, word for word. pnpm pack falls back to the
    // workspace root's LICENSE when a package has none, so this fails only
    // when the root file is gone too; the per-package copies are for a plain
    // `npm pack` and for readers of the package directory.
    const license = join(scratch, "node_modules", name, "LICENSE")
    if (!existsSync(license)) {
      fail(name, "LICENSE missing", "the tarball contains no LICENSE file")
    } else if (
      readFileSync(license, "utf8") !==
      readFileSync(join(ROOT, "LICENSE"), "utf8")
    ) {
      fail(name, "LICENSE differs", "it is not a copy of the root LICENSE")
    } else {
      ok("ships LICENSE")
    }

    // A command is installed the way a person installs it: its package in a
    // project of its own, with only the tarballs of the ic-reactor packages it
    // depends on (npm has none of them at this version yet), so a dependency
    // it does not declare is not found in another package's tree. Each
    // command then runs from node_modules/.bin, where npm links it: the
    // shebang, the executable bit and every import of the installed copy.
    const commands = commandsOf(manifest)
    const alone = join(apart, name.replace(/^@[^/]+\//, ""))
    if (commands.length > 0) {
      const own = tarballs.filter(
        (t) =>
          t.file === file || Object.hasOwn(manifest.dependencies ?? {}, t.name)
      )
      mkdirSync(alone)
      writeFileSync(
        join(alone, "package.json"),
        JSON.stringify({
          name: "verify-command",
          private: true,
          version: "1.0.0",
        })
      )
      try {
        run(
          "npm",
          [
            "install",
            "--no-audit",
            "--no-fund",
            "--loglevel",
            "error",
            ...own.map((t) => join(scratch, t.file)),
          ],
          { cwd: alone }
        )
        ok(`installs alone (with ${own.map((t) => t.name).join(", ")})`)
      } catch (e) {
        fail(name, "install alone", e.stderr || e.stdout || e.message)
      }
    }
    for (const command of commands) {
      const bin = join(alone, "node_modules", ".bin", command)
      try {
        const printed = run(bin, ["--version"], { cwd: alone }).trim()
        if (printed === manifest.version) {
          ok(`${command} --version (${printed})`)
        } else {
          fail(
            name,
            `${command} --version`,
            `it printed ${printed}, not ${manifest.version}`
          )
        }
      } catch (e) {
        fail(name, `${command} --version`, e.stderr || e.stdout || e.message)
      }
    }

    // The MCP server as a client starts it: it lists a canister's tools from a
    // .did, which it compiles with @meantjs/cli in a worker thread, so the
    // installed copy has to find its worker and the compiler. Nothing goes to
    // the network: the interface is the file, and only tools are listed.
    if (name === "@ic-reactor/mcp") {
      const did = join(alone, "mcp-check.did")
      writeFileSync(did, MCP_CHECK_DID)
      try {
        const { tools, stderr } = await listMcpTools(
          join(alone, "node_modules", ".bin", "ic-reactor-mcp"),
          [
            "--canister",
            "check=ryjl3-tyaaa-aaaaa-aaaba-cai",
            "--did",
            `check=${did}`,
          ],
          { cwd: alone }
        )
        // With no --identity it reads only: the query gets a tool of its own,
        // the update none.
        if (tools.includes("check_greet") && !tools.includes("check_set")) {
          ok(`ic-reactor-mcp lists the tools of a .did (${tools.join(", ")})`)
        } else {
          fail(
            name,
            "ic-reactor-mcp tools/list",
            `expected check_greet and no check_set, got ${tools.join(", ")}\n${stderr}`
          )
        }
      } catch (e) {
        fail(name, "ic-reactor-mcp tools/list", e.message)
      }
    }

    if (isBinOnly(manifest)) {
      ok(
        `skip import ${name} (bin-only package — the executable is the whole surface)`
      )
    }

    // The public subpaths of the exports map; a bin-only package without
    // one exposes no module.
    const exportsMap = exportsMapOf(manifest)
    const subpaths = isBinOnly(manifest) ? [] : publicSubpaths(manifest)

    // A bin package's entry *is* the executable, so importing it runs the program
    // rather than exposing a module surface. Only its declarations are checked.
    const binTargets = new Set(
      Object.values(
        typeof manifest.bin === "string"
          ? { [name]: manifest.bin }
          : manifest.bin || {}
      ).map((p) => String(p).replace(/^\.\//, ""))
    )
    const isBinEntry = (target) =>
      binTargets.has(String(target || "").replace(/^\.\//, ""))

    for (const sub of subpaths) {
      const spec = specifierOf(name, sub)

      const entryTarget =
        sub === "."
          ? (exportsMap?.["."]?.import?.default ??
            exportsMap?.["."]?.import ??
            exportsMap?.["."]?.default ??
            manifest.main)
          : undefined
      if (isBinEntry(entryTarget)) {
        ok(`skip import ${spec} (bin entry — importing would run the CLI)`)
        continue
      }

      // ESM import
      try {
        const out = run(
          process.execPath,
          [
            "-e",
            `import(${JSON.stringify(spec)}).then(m=>{
             const n=Object.keys(m).length;
             if(n===0 && ${!(sub === "." && mayExportNothing(manifest))}) { console.error("no exports"); process.exit(1) }
             console.log("exports:"+n)
           }).catch(e=>{ console.error(e.code||"", e.message); process.exit(1) })`,
          ],
          { cwd: scratch }
        )
        ok(`import ${spec} (${out.trim()})`)
        if (
          sub === "." &&
          MAY_EXPORT_NOTHING.has(name) &&
          out.trim() !== "exports:0"
        ) {
          console.warn(
            `  ! ${name} exports something now: remove it from MAY_EXPORT_NOTHING so an empty entry fails again`
          )
        }
      } catch (e) {
        fail(name, `import ${spec}`, e.stderr || e.stdout || e.message)
      }

      // The `react-server` entry, resolved the way a React Server Component
      // bundle resolves it. It must load without reaching React at all (the
      // resolve hook throws on any React specifier) and export no hook.
      const cond = exportsMap?.[sub]
      if (cond && typeof cond === "object" && "react-server" in cond) {
        try {
          const out = run(
            process.execPath,
            [
              "--conditions=react-server",
              "--input-type=module",
              "-e",
              `import * as nodeModule from "node:module"
             if (typeof nodeModule.registerHooks === "function") {
               nodeModule.registerHooks({
                 resolve(specifier, context, next) {
                   if (/^(react|react-dom)(\\/|$)|^@tanstack\\/react-query(\\/|$)/.test(specifier))
                     throw new Error("the react-server entry resolved " + specifier)
                   return next(specifier, context)
                 },
               })
             }
             const m = await import(${JSON.stringify(spec)})
             const names = Object.keys(m)
             if (names.length === 0) { console.error("no exports"); process.exit(1) }
             const hooks = names.filter((n) => /^use[A-Z]/.test(n))
             if (hooks.length) { console.error("exports hooks: " + hooks.join(", ")); process.exit(1) }
             console.log("exports:" + names.length +
               (nodeModule.registerHooks ? ", no React module resolved" : ""))`,
            ],
            { cwd: scratch }
          )
          ok(`import ${spec} [react-server] (${out.trim()})`)
        } catch (e) {
          fail(
            name,
            `import ${spec} [react-server]`,
            e.stderr || e.stdout || e.message
          )
        }
      }

      // CJS require, only where a require condition is actually declared.
      const hasRequire = cond && typeof cond === "object" && "require" in cond
      if (hasRequire) {
        try {
          run(
            process.execPath,
            [
              "-e",
              `const m=require(${JSON.stringify(spec)});
             if(!m||Object.keys(m).length===0){console.error("no exports");process.exit(1)}`,
            ],
            { cwd: scratch, env: { ...process.env } }
          )
          ok(`require ${spec}`)
        } catch (e) {
          fail(name, `require ${spec}`, e.stderr || e.stdout || e.message)
        }
      }
    }

    // The manifest must not advertise types it does not ship.
    if (manifest.types || manifest.typings) {
      const declared = manifest.types || manifest.typings
      try {
        run(
          process.execPath,
          [
            "-e",
            `require("node:fs").accessSync(require("node:path").join(
             require("node:path").dirname(require.resolve(${JSON.stringify(name + "/package.json")})),
             ${JSON.stringify(declared)}))`,
          ],
          { cwd: scratch }
        )
        ok(`ships declared types (${declared})`)
      } catch {
        fail(
          name,
          `declared types missing: ${declared}`,
          "package.json advertises this file but the tarball does not contain it"
        )
      }
    }
  }

  // ── 4. publint ──────────────────────────────────────────────────────────────
  console.log("\npublint")
  for (const { name, file } of tarballs) {
    try {
      run("npx", ["--yes", "publint@latest", join(scratch, file)], {
        cwd: ROOT,
      })
      ok(`publint ${name}`)
    } catch (e) {
      fail(name, `publint ${name}`, e.stdout || e.stderr || e.message)
    }
  }

  // ── 5. Are The Types Wrong ──────────────────────────────────────────────────
  if (!SKIP_ATTW) {
    console.log("\nattw")
    for (const { name, file, manifest } of tarballs) {
      if (isBinOnly(manifest)) {
        ok(`skip attw ${name} (bin-only package ships no types)`)
        continue
      }
      try {
        // --profile node16: these packages are ESM-first and target Node 16+ /
        // modern bundler resolution. node10 is TypeScript's pre-`exports` algorithm,
        // under which subpath exports cannot resolve at all without shipping
        // root-level shim files.
        // cjs-resolves-to-esm: core/react/candid/cli are deliberately ESM-only
        //   ("type": "module", no require condition); CJS consumers use dynamic import.
        run(
          "npx",
          [
            "--yes",
            "@arethetypeswrong/cli@latest",
            "--pack",
            join(scratch, file),
            "--profile",
            "node16",
            "--ignore-rules",
            "cjs-resolves-to-esm",
          ],
          { cwd: ROOT }
        )
        ok(`attw ${name}`)
      } catch (e) {
        fail(name, `attw ${name}`, e.stdout || e.stderr || e.message)
      }
    }
  }
} finally {
  if (!KEEP) {
    rmSync(scratch, { recursive: true, force: true })
    rmSync(apart, { recursive: true, force: true })
  } else console.log(`\nscratch kept at ${scratch} and ${apart}`)
}

console.log("")
if (failures.length) {
  console.error(`✗ ${failures.length} artifact problem(s) found:`)
  for (const f of failures) console.error(`   - [${f.pkg}] ${f.what}`)
  process.exit(1)
}
console.log("✓ published artifacts verified")
