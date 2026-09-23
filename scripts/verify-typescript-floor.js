#!/usr/bin/env node
/**
 * Do the published declarations compile with the oldest TypeScript we support?
 *
 * The packages build with the newest TypeScript, but a consumer compiles their
 * emitted `.d.ts` files, and those of their dependencies, with its own. Those
 * declarations need TypeScript 5.7: they use generic typed arrays such as
 * `Uint8Array<ArrayBuffer>`, which 5.7 introduced, and older compilers reject
 * them with TS2315 "Type 'Uint8Array' is not generic". The docs said
 * "TypeScript 5+" while every check in CI compiled with the newest TypeScript,
 * so nothing noticed (#591).
 *
 * This writes a consumer, in a temporary directory, that imports every public
 * entry point of the packages below (each subpath of their `exports` maps),
 * and compiles it with TYPESCRIPT_FLOOR, `strict` and `skipLibCheck: false`:
 * once with `moduleResolution: "bundler"` and once with `"node16"`. The
 * consumer reaches the packages through symlinks, so their declarations resolve
 * their own dependencies from the workspace install, at the lockfile's versions.
 *
 * It reads the declarations `pnpm build` wrote to `packages/<name>/dist`, so
 * build first. `pnpm verify:peer-floors` runs it.
 *
 * Usage
 *   node scripts/verify-typescript-floor.js [--keep]
 *
 *   --keep   leave the consumer directory in place (debugging)
 */
import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, normalize } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..")
const keep = process.argv.includes("--keep")

/**
 * The oldest TypeScript the packages support, the first stable 5.7 release.
 * The docs name it as well, so change them with it: the installation guide,
 * llms-full.txt, packages/cli/README.md, and the badges in README.md and
 * packages/core/README.md.
 */
const TYPESCRIPT_FLOOR = "5.7.2"

/** The packages whose declarations are compiled, by directory under packages/. */
const PACKAGES = ["core", "react", "candid", "parser"]

/**
 * The tsconfig the installation guide recommends, with `skipLibCheck` off so
 * the declarations are checked. `types: []` keeps out every `@types` package
 * the imports do not reach, so a declaration that uses Node's globals without
 * importing them fails here, as it would in a browser app.
 */
const COMPILER_OPTIONS = {
  strict: true,
  skipLibCheck: false,
  noEmit: true,
  target: "ES2020",
  lib: ["ES2020", "DOM", "DOM.Iterable"],
  esModuleInterop: true,
  types: [],
}

/**
 * The resolution modes the packages support, as verify-package-artifacts.mjs
 * checks them with attw's node16 profile. `node10` is not one: it ignores
 * `exports`, so the `@icp-sdk/core` subpaths the declarations import do not
 * resolve.
 */
const MODES = {
  bundler: { module: "ESNext", moduleResolution: "Bundler" },
  node16: { module: "Node16", moduleResolution: "Node16" },
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n")
}

function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, stdio: "inherit" }).status === 0
}

/**
 * The specifier of every public entry point: each subpath of the `exports` map
 * except `./package.json`. A pattern such as `./*` cannot be listed, so it
 * fails here instead of going unchecked.
 */
function entryPoints({ name, exports }) {
  const subpaths =
    exports &&
    typeof exports === "object" &&
    /^\./.test(Object.keys(exports)[0])
      ? Object.keys(exports).filter((subpath) => subpath !== "./package.json")
      : ["."]
  return subpaths.map((subpath) => {
    const specifier = subpath === "." ? name : `${name}/${subpath.slice(2)}`
    if (subpath.includes("*")) {
      throw new Error(`Cannot list the entry points matching "${specifier}"`)
    }
    return specifier
  })
}

/** Every file an `exports` value names under a `types` condition. */
function typesTargets(value) {
  if (value === null || typeof value !== "object") return []
  return Object.entries(value).flatMap(([key, target]) =>
    key === "types" && typeof target === "string"
      ? [target]
      : typesTargets(target)
  )
}

/** Writes the consumer and returns the specifiers it imports. */
function writeConsumer(consumer, links) {
  const specifiers = []
  for (const dir of PACKAGES) {
    const packageDir = join(rootDir, "packages", dir)
    const manifest = readJson(join(packageDir, "package.json"))
    const declared = [manifest.types, ...typesTargets(manifest.exports)]
      .filter((file) => file !== undefined)
      .map((file) => normalize(file))
    const missing = [...new Set(declared)].filter(
      (file) => !existsSync(join(packageDir, file))
    )
    if (missing.length > 0) {
      throw new Error(
        `${manifest.name} is not built (no ${missing.join(", ")}). Run \`pnpm build\` first.`
      )
    }
    const link = join(consumer, "node_modules", manifest.name)
    mkdirSync(dirname(link), { recursive: true })
    symlinkSync(packageDir, link, "dir")
    links.push(link)
    specifiers.push(...entryPoints(manifest))
  }

  writeJson(join(consumer, "package.json"), { private: true, type: "module" })
  const names = specifiers.map((_, i) => `entry${i}`)
  writeFileSync(
    join(consumer, "consumer.ts"),
    [
      ...specifiers.map(
        (specifier, i) => `import * as ${names[i]} from "${specifier}"`
      ),
      `export { ${names.join(", ")} }`,
      "",
    ].join("\n")
  )
  for (const [mode, options] of Object.entries(MODES)) {
    writeJson(join(consumer, `tsconfig.${mode}.json`), {
      compilerOptions: { ...COMPILER_OPTIONS, ...options },
      files: ["consumer.ts"],
    })
  }
  return specifiers
}

const consumer = mkdtempSync(join(tmpdir(), "typescript-floor-"))
const links = []
let ok = false
try {
  const specifiers = writeConsumer(consumer, links)
  console.log(`\n▶ TypeScript ${TYPESCRIPT_FLOOR}: ${specifiers.join(", ")}`)

  // Run from the consumer, outside the workspace, so npx cannot pick up the
  // workspace's own TypeScript, and confirm which compiler it runs. Under
  // `pnpm verify:peer-floors`, npm warns about every npm_config_* variable
  // pnpm exports; `--loglevel=error` keeps those warnings out of the output.
  const tsc = [
    "--yes",
    "--loglevel=error",
    "--package",
    `typescript@${TYPESCRIPT_FLOOR}`,
    "tsc",
  ]
  const version = spawnSync("npx", [...tsc, "--version"], {
    cwd: consumer,
    encoding: "utf8",
  })
  const found = (version.stdout ?? "").trim()
  if (found !== `Version ${TYPESCRIPT_FLOOR}`) {
    throw new Error(
      `npx did not run TypeScript ${TYPESCRIPT_FLOOR}: ${found || version.stderr || version.error?.message}`
    )
  }
  console.log(found)
  const failed = Object.keys(MODES).filter((mode) => {
    console.log(`  moduleResolution: ${mode}`)
    return !run("npx", [...tsc, "--project", `tsconfig.${mode}.json`], consumer)
  })
  if (failed.length > 0) {
    throw new Error(
      `The declarations do not compile with TypeScript ${TYPESCRIPT_FLOOR} (moduleResolution: ${failed.join(", ")})`
    )
  }
  ok = true
  console.log(
    `✔ The declarations compile with TypeScript ${TYPESCRIPT_FLOOR} (moduleResolution: ${Object.keys(MODES).join(", ")})`
  )
} catch (error) {
  console.error(`✖ ${error.message}`)
} finally {
  if (keep) {
    console.log(`  consumer kept at ${consumer}`)
  } else {
    // Unlink the package links first: they point into packages/, and nothing
    // below should ever walk into them.
    for (const link of links) unlinkSync(link)
    rmSync(consumer, { recursive: true, force: true })
  }
}
process.exit(ok ? 0 : 1)
