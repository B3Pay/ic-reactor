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
 *   1. imports every entry point in real Node ESM
 *   2. requires every CJS entry point where one is declared
 *   3. runs `publint` over each tarball
 *   4. runs `attw` (Are The Types Wrong) over each tarball
 *
 * Usage: node scripts/verify-package-artifacts.mjs [--skip-attw] [--keep]
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")
const KEEP = process.argv.includes("--keep")
const SKIP_ATTW = process.argv.includes("--skip-attw")

// Publishable workspace packages, in dependency order.
const PACKAGES = [
  "packages/parser",
  "packages/core",
  "packages/react",
  "packages/candid",
  "packages/codegen",
  "packages/vite-plugin",
  "packages/cli",
]

// Peers a consumer would install alongside them. Pinned loosely on purpose: this
// checks resolvability of our artifacts, not of the peer tree.
const PEERS = [
  "@icp-sdk/core@^6.0.0",
  "@icp-sdk/auth@^8.0.0",
  "@tanstack/query-core@^5",
  "@tanstack/react-query@^5",
  "react@^19",
  "react-dom@^19",
]

/**
 * A package whose entire published surface is its executable: it declares `bin`
 * and deliberately declares no module entry at all. @ic-reactor/cli is one — it
 * used to point `main`/`types` at the shebang file (and at a 20-byte d.ts built
 * from it), which advertised a module surface that does not exist. There is
 * nothing here for the import check or attw to look at.
 */
const isBinOnly = (m) =>
  Boolean(m.bin) && !m.exports && !m.main && !m.module && !m.types && !m.typings

const failures = []
function fail(pkg, what, detail) {
  failures.push({ pkg, what, detail })
  console.error(`  ✗ ${what}\n${String(detail).split("\n").slice(0, 12).map((l) => `      ${l}`).join("\n")}`)
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
    if (!tgz) throw new Error(`npm pack produced no tarball for ${rel}`)
    tarballs.push({ name: manifest.name, file: tgz, manifest, dir })
    console.log(`packed ${manifest.name} -> ${tgz}`)
  }

  // ── 2. Install them into a scratch project outside the workspace ─────────────
  writeFileSync(
    join(scratch, "package.json"),
    JSON.stringify({ name: "verify-esm", private: true, version: "1.0.0", type: "module" }, null, 2)
  )
  console.log(`\ninstalling ${tarballs.length} tarballs + peers into scratch project...`)
  try {
    // --legacy-peer-deps: @icp-sdk/auth@8 still declares a peer of @icp-sdk/core@^5,
    // which npm refuses to resolve against the v6 we use. That is an upstream
    // manifest bug and is not what this script is checking.
    run("npm", ["install", "--no-audit", "--no-fund", "--legacy-peer-deps",
      "--loglevel", "error", ...tarballs.map((t) => `./${t.file}`), ...PEERS], { cwd: scratch })
  } catch (e) {
    console.error("install into scratch project failed:")
    console.error(String(e.stderr || e.stdout || e.message).split("\n").slice(0, 25).join("\n"))
    process.exit(1)
  }
  console.log("installed\n")

  // ── 3. Import every entry point the way a consumer would ────────────────────
  for (const { name, manifest } of tarballs) {
    console.log(`${name}`)

    if (isBinOnly(manifest)) {
      ok(`skip import ${name} (bin-only package — the executable is the whole surface)`)
    }

    // Derive the public subpaths from the exports map (skip ./package.json).
    const subpaths = manifest.exports
      ? Object.keys(manifest.exports).filter((k) => k !== "./package.json")
      : isBinOnly(manifest)
        ? []
        : ["."]

    // A bin package's entry *is* the executable, so importing it runs the program
    // rather than exposing a module surface. Only its declarations are checked.
    const binTargets = new Set(
      Object.values(
        typeof manifest.bin === "string" ? { [name]: manifest.bin } : manifest.bin || {}
      ).map((p) => String(p).replace(/^\.\//, ""))
    )
    const isBinEntry = (target) =>
      binTargets.has(String(target || "").replace(/^\.\//, ""))

    for (const sub of subpaths) {
      const spec = sub === "." ? name : `${name}/${sub.replace(/^\.\//, "")}`

      const entryTarget =
        sub === "."
          ? manifest.exports?.["."]?.import?.default ??
            manifest.exports?.["."]?.import ??
            manifest.exports?.["."]?.default ??
            manifest.main
          : undefined
      if (isBinEntry(entryTarget)) {
        ok(`skip import ${spec} (bin entry — importing would run the CLI)`)
        continue
      }

      // ESM import
      try {
        const out = run(process.execPath, ["-e",
          `import(${JSON.stringify(spec)}).then(m=>{
             const n=Object.keys(m).length;
             if(n===0) { console.error("no exports"); process.exit(1) }
             console.log("exports:"+n)
           }).catch(e=>{ console.error(e.code||"", e.message); process.exit(1) })`,
        ], { cwd: scratch })
        ok(`import ${spec} (${out.trim()})`)
      } catch (e) {
        fail(name, `import ${spec}`, e.stderr || e.stdout || e.message)
      }

      // CJS require, only where a require condition is actually declared.
      const cond = manifest.exports?.[sub]
      const hasRequire = cond && typeof cond === "object" && "require" in cond
      if (hasRequire) {
        try {
          run(process.execPath, ["-e",
            `const m=require(${JSON.stringify(spec)});
             if(!m||Object.keys(m).length===0){console.error("no exports");process.exit(1)}`,
          ], { cwd: scratch, env: { ...process.env } })
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
        run(process.execPath, ["-e",
          `require("node:fs").accessSync(require("node:path").join(
             require("node:path").dirname(require.resolve(${JSON.stringify(name + "/package.json")})),
             ${JSON.stringify(declared)}))`,
        ], { cwd: scratch })
        ok(`ships declared types (${declared})`)
      } catch {
        fail(name, `declared types missing: ${declared}`,
          "package.json advertises this file but the tarball does not contain it")
      }
    }
  }

  // ── 4. publint ──────────────────────────────────────────────────────────────
  console.log("\npublint")
  for (const { name, file } of tarballs) {
    try {
      run("npx", ["--yes", "publint@latest", join(scratch, file)], { cwd: ROOT })
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
        run("npx", ["--yes", "@arethetypeswrong/cli@latest", "--pack", join(scratch, file),
          "--profile", "node16", "--ignore-rules", "cjs-resolves-to-esm"], { cwd: ROOT })
        ok(`attw ${name}`)
      } catch (e) {
        fail(name, `attw ${name}`, e.stdout || e.stderr || e.message)
      }
    }
  }
} finally {
  if (!KEEP) rmSync(scratch, { recursive: true, force: true })
  else console.log(`\nscratch kept at ${scratch}`)
}

console.log("")
if (failures.length) {
  console.error(`✗ ${failures.length} artifact problem(s) found:`)
  for (const f of failures) console.error(`   - [${f.pkg}] ${f.what}`)
  process.exit(1)
}
console.log("✓ published artifacts verified")
