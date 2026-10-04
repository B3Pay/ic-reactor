/**
 * Tests of `test-examples-published.mjs`'s own checks, on manifests and
 * node_modules trees built for the purpose: what keeps an example from
 * installing standalone against the published beta, and what shows that an
 * install did not come from the registry. The install, the example's scripts
 * and the dev server are the script's run itself (`pnpm test:examples:published`).
 *
 * Run by `pnpm test:scripts`.
 */
import assert from "node:assert/strict"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, dirname, join } from "node:path"
import { after, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import {
  REGISTRY,
  REGISTRY_ARGS,
  ancestorFindings,
  checkInstalled,
  checkLockfile,
  checkManifest,
  isolatedEnv,
  moduleImports,
  pageScripts,
  parseArgs,
  parseNpmCommand,
  requiredScriptFindings,
  scopePackageNames,
  stackblitzStartCommand,
  trackedConfigFindings,
  waitForPublished,
} from "./test-examples-published.mjs"

const BETA = "4.0.0-beta.1"
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")

/** npm's answer for the ranges these tests use. */
const PUBLISHED = ["3.12.5", "3.13.0", "4.0.0-beta.0", BETA]
function satisfying(name, range) {
  assert.ok(name.startsWith("@ic-reactor/"), `asked npm about ${name}`)
  if (range === `^${BETA}` || range === BETA) return [BETA]
  if (range === "^4.0.0-beta.0") return ["4.0.0-beta.0", BETA]
  if (range === "4.0.0-beta.0") return ["4.0.0-beta.0"]
  if (range === "^3.12.0") return ["3.12.5", "3.13.0"]
  if (range === "^4.0.0") return []
  throw new Error(`unexpected range ${range} (published: ${PUBLISHED})`)
}

const check = (manifest) =>
  checkManifest(manifest, { betaVersion: BETA, satisfying })

const roots = []
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

function scratch() {
  const root = mkdtempSync(join(tmpdir(), "test-examples-published-"))
  roots.push(root)
  return root
}

/** A project whose node_modules holds `packages` ({ name: version }). */
function project(packages = {}) {
  const root = scratch()
  for (const [name, version] of Object.entries(packages)) {
    const dir = join(root, "node_modules", name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name, version }))
  }
  return root
}

describe("checkManifest", () => {
  it("passes ranges the beta satisfies, in every dependency field", async () => {
    assert.deepEqual(
      await check({
        dependencies: { "@ic-reactor/core": `^${BETA}`, react: "^19.3.0" },
        devDependencies: { "@ic-reactor/vite-plugin": BETA },
        peerDependencies: { "@ic-reactor/react": "^4.0.0-beta.0" },
      }),
      []
    )
  })

  it("refuses a workspace: range, for any package", async () => {
    const findings = await check({
      dependencies: { "@ic-reactor/core": "workspace:*" },
      devDependencies: { "some-tool": "workspace:^1.0.0" },
    })
    assert.equal(findings.length, 2)
    assert.match(
      findings[0],
      /dependencies\.@ic-reactor\/core is "workspace:\*"/
    )
    assert.match(
      findings[1],
      /devDependencies\.some-tool is "workspace:\^1\.0\.0"/
    )
    for (const finding of findings)
      assert.match(finding, /never in a standalone install/)
  })

  it("refuses file:, link: and portal: ranges", async () => {
    const findings = await check({
      dependencies: {
        "@ic-reactor/core": "file:../../packages/core",
        "@ic-reactor/react": "link:../../packages/react",
        other: "portal:../other",
      },
    })
    assert.deepEqual(
      findings.map((f) => f.match(/ a (\w+:) range/)?.[1]),
      ["file:", "link:", "portal:"]
    )
  })

  it("does not ask npm about a range it refused", async () => {
    // satisfying() throws on a range it does not know.
    await check({ dependencies: { "@ic-reactor/core": "workspace:^4.0.0" } })
  })

  it("reports a range the beta does not satisfy, with what npm would install", async () => {
    assert.deepEqual(
      await check({ dependencies: { "@ic-reactor/core": "^3.12.0" } }),
      [
        `dependencies.@ic-reactor/core is "^3.12.0", which beta (${BETA}) does not satisfy: npm would install 3.13.0`,
      ]
    )
    assert.deepEqual(
      await check({ dependencies: { "@ic-reactor/core": "4.0.0-beta.0" } }),
      [
        `dependencies.@ic-reactor/core is "4.0.0-beta.0", which beta (${BETA}) does not satisfy: npm would install 4.0.0-beta.0`,
      ]
    )
  })

  it("reports a range nothing published satisfies, as a GA range is before GA", async () => {
    assert.deepEqual(
      await check({ dependencies: { "@ic-reactor/react": "^4.0.0" } }),
      [
        `dependencies.@ic-reactor/react is "^4.0.0", which beta (${BETA}) does not satisfy: no published version satisfies it`,
      ]
    )
  })

  it("leaves other packages' registry ranges to npm", async () => {
    assert.deepEqual(await check({ dependencies: { next: "^16.3.8" } }), [])
  })
})

describe("checkInstalled", () => {
  const declared = ["@ic-reactor/core", "@ic-reactor/react"]

  it("passes real directories at the beta version", () => {
    const dir = project({
      "@ic-reactor/core": BETA,
      "@ic-reactor/react": BETA,
    })
    assert.deepEqual(checkInstalled(dir, declared, BETA), {
      installed: [
        { name: "@ic-reactor/core", version: BETA },
        { name: "@ic-reactor/react", version: BETA },
      ],
      findings: [],
    })
  })

  it("reports a symlinked package, as a workspace link is", () => {
    const dir = project({ "@ic-reactor/core": BETA })
    const linked = project({ "@ic-reactor/react": BETA })
    symlinkSync(
      join(linked, "node_modules", "@ic-reactor", "react"),
      join(dir, "node_modules", "@ic-reactor", "react"),
      "dir"
    )
    const { findings } = checkInstalled(dir, declared, BETA)
    assert.equal(findings.length, 1)
    assert.match(
      findings[0],
      /^@ic-reactor\/react is a symlink \(to .+\), not a package installed from the registry$/
    )
  })

  it("reports a version other than the beta", () => {
    const dir = project({
      "@ic-reactor/core": BETA,
      "@ic-reactor/react": "3.13.0",
    })
    assert.deepEqual(checkInstalled(dir, declared, BETA).findings, [
      `@ic-reactor/react installed at 3.13.0, not ${BETA} (beta)`,
    ])
  })

  it("checks an @ic-reactor/* package installed without being declared", () => {
    const dir = project({
      "@ic-reactor/core": BETA,
      "@ic-reactor/react": BETA,
      "@ic-reactor/vite-plugin": "4.0.0-beta.0",
    })
    assert.deepEqual(checkInstalled(dir, declared, BETA).findings, [
      `@ic-reactor/vite-plugin installed at 4.0.0-beta.0, not ${BETA} (beta)`,
    ])
  })

  it("reports a declared package that is not installed", () => {
    const dir = project({ "@ic-reactor/core": BETA })
    assert.deepEqual(checkInstalled(dir, declared, BETA).findings, [
      "@ic-reactor/react is declared but not installed",
    ])
    assert.deepEqual(
      checkInstalled(scratch(), ["@ic-reactor/core"], BETA).findings,
      ["@ic-reactor/core is declared but not installed"]
    )
  })
})

describe("isolatedEnv", () => {
  const repo = "/work/ic-reactor"

  it("drops PATH entries inside the repository and keeps the rest", () => {
    const env = isolatedEnv(
      {
        PATH: [
          "/work/ic-reactor/node_modules/.bin",
          "/work/ic-reactor/examples/x/node_modules/.bin",
          "/work/ic-reactor",
          "/work/ic-reactor-other/bin",
          "/usr/bin",
        ].join(delimiter),
      },
      repo
    )
    assert.equal(
      env.PATH,
      ["/work/ic-reactor-other/bin", "/usr/bin"].join(delimiter)
    )
  })

  it("drops what a pnpm run sets and points npm at the public registry", () => {
    const env = isolatedEnv(
      {
        PATH: "/usr/bin",
        HOME: "/home/me",
        npm_config_registry: "http://localhost:4873/",
        npm_package_name: "ic-reactor",
        npm_lifecycle_event: "test:examples:published",
        PNPM_SCRIPT_SRC_DIR: repo,
        pnpm_config_verify_deps_before_run: "false",
        INIT_CWD: repo,
        NODE_PATH: `${repo}/node_modules`,
      },
      repo
    )
    assert.deepEqual(env, {
      PATH: "/usr/bin",
      HOME: "/home/me",
      npm_config_registry: REGISTRY,
      npm_config_update_notifier: "false",
    })
  })
})

describe("the StackBlitz start command", () => {
  it("reads startCommand from .stackblitzrc", () => {
    const dir = scratch()
    writeFileSync(
      join(dir, ".stackblitzrc"),
      JSON.stringify({
        installDependencies: true,
        startCommand: " npm run dev ",
      })
    )
    assert.deepEqual(stackblitzStartCommand(dir), { command: "npm run dev" })
  })

  it("reports a missing file, a file that is not JSON, and no startCommand", () => {
    const missing = scratch()
    assert.match(
      stackblitzStartCommand(missing).finding,
      /\.stackblitzrc is missing/
    )

    const broken = scratch()
    writeFileSync(
      join(broken, ".stackblitzrc"),
      "{ startCommand: npm run dev }"
    )
    assert.match(stackblitzStartCommand(broken).finding, /is not JSON/)

    const empty = scratch()
    writeFileSync(
      join(empty, ".stackblitzrc"),
      JSON.stringify({ startCommand: true })
    )
    assert.match(
      stackblitzStartCommand(empty).finding,
      /no startCommand string/
    )
  })

  it("names the package script a start command runs, and its arguments after --", () => {
    assert.deepEqual(parseNpmCommand("npm test"), { script: "test", args: [] })
    assert.deepEqual(parseNpmCommand("npm t"), { script: "test", args: [] })
    assert.deepEqual(parseNpmCommand("npm run test"), {
      script: "test",
      args: [],
    })
    assert.deepEqual(parseNpmCommand("npm run dev"), {
      script: "dev",
      args: [],
    })
    assert.deepEqual(parseNpmCommand("npm run-script gen:check"), {
      script: "gen:check",
      args: [],
    })
    assert.deepEqual(parseNpmCommand("npm run dev -- --webpack"), {
      script: "dev",
      args: ["--webpack"],
    })
    assert.deepEqual(parseNpmCommand("npm run dev --  --host 0.0.0.0 "), {
      script: "dev",
      args: ["--host", "0.0.0.0"],
    })
    // npm itself would take these as its own flags, not the script's.
    assert.equal(parseNpmCommand("npm run dev --webpack"), undefined)
    assert.equal(parseNpmCommand("npm run"), undefined)
    assert.equal(parseNpmCommand("node src/cli.ts demo"), undefined)
  })

  it("runs next-ssr's tests, not its dev server: Next 16 renders no page in a WebContainer", () => {
    const next = JSON.parse(
      readFileSync(
        join(repoRoot, "examples", "next-ssr", ".stackblitzrc"),
        "utf8"
      )
    )
    assert.deepEqual(parseNpmCommand(next.startCommand), {
      script: "test",
      args: [],
    })
  })
})

describe("pageScripts", () => {
  it("lists the page's own scripts as absolute URLs, once each, and which are modules", () => {
    const html = `<!doctype html><html><head>
      <script type="module" src="/@vite/client"></script>
      <script type="module" src="/src/main.tsx"></script>
      <script src="/_next/static/chunks/a.js?v=1&amp;x=2" async=""></script>
      <script src="/src/main.tsx"></script>
      <script src="https://cdn.example.com/lib.js"></script>
      <script>inline()</script>
    </head></html>`
    assert.deepEqual(pageScripts(html, "http://localhost:5173/"), [
      { url: "http://localhost:5173/@vite/client", module: true },
      { url: "http://localhost:5173/src/main.tsx", module: true },
      {
        url: "http://localhost:5173/_next/static/chunks/a.js?v=1&x=2",
        module: false,
      },
    ])
  })
})

describe("moduleImports", () => {
  const url = "http://localhost:5173/src/main.tsx"

  it("lists the app modules a served module imports, statically or with import()", () => {
    const code = [
      `import __vite__cjsImport0 from "/node_modules/.vite/deps/react.js?v=abc";`,
      `import { createHotContext } from "/@vite/client";`,
      `import { App } from "/src/App.tsx";`,
      `import {`,
      `  a,`,
      `  b,`,
      `} from "/src/lib/ab.ts?t=123";`,
      `import "/src/index.css";`,
      `export { c } from "./c.ts";`,
      `export * from "../shared/d.ts";`,
      `const Lazy = lazy(() => import("/src/Lazy.tsx"));`,
      `import { ext } from "https://cdn.example.com/x.js";`,
      `import { pkg } from "@ic-reactor/core";`,
      `const s = "it comes from '/src/not-an-import.ts'";`,
      `import { App as Again } from "/src/App.tsx";`,
    ].join("\n")
    assert.deepEqual(moduleImports(code, url), [
      "http://localhost:5173/src/App.tsx",
      "http://localhost:5173/src/lib/ab.ts?t=123",
      "http://localhost:5173/src/c.ts",
      "http://localhost:5173/shared/d.ts",
      "http://localhost:5173/src/index.css",
      "http://localhost:5173/src/Lazy.tsx",
    ])
  })
})

describe("checkLockfile", () => {
  const tarball = (n) => `${REGISTRY}@ic-reactor/${n}/-/${n}-${BETA}.tgz`
  const published = {
    "@ic-reactor/core": { tarball: tarball("core"), integrity: "sha512-core" },
    "@ic-reactor/react": {
      tarball: tarball("react"),
      integrity: "sha512-react",
    },
  }
  const entry = (n, over = {}) => ({
    version: BETA,
    resolved: tarball(n),
    integrity: `sha512-${n}`,
    ...over,
  })
  const lock = (packages) => ({
    lockfileVersion: 3,
    packages: { "": {}, ...packages },
  })
  const installed = ["@ic-reactor/core", "@ic-reactor/react"]

  it("passes the registry's tarballs with the registry's integrity", () => {
    assert.deepEqual(
      checkLockfile(
        lock({
          "node_modules/@ic-reactor/core": entry("core"),
          "node_modules/@ic-reactor/react": entry("react"),
          "node_modules/react": { version: "19.3.0", resolved: "x" },
        }),
        { installed, published }
      ),
      []
    )
  })

  it("reports a tarball resolved from another registry", () => {
    const elsewhere = `http://127.0.0.1:4873/@ic-reactor/react/-/react-${BETA}.tgz`
    assert.deepEqual(
      checkLockfile(
        lock({
          "node_modules/@ic-reactor/core": entry("core"),
          "node_modules/@ic-reactor/react": entry("react", {
            resolved: elsewhere,
          }),
        }),
        { installed, published }
      ),
      [
        `node_modules/@ic-reactor/react was resolved from ${elsewhere}, not ${tarball("react")}`,
      ]
    )
  })

  it("reports an integrity other than the registry's, nested entries too", () => {
    assert.deepEqual(
      checkLockfile(
        lock({
          "node_modules/@ic-reactor/core": entry("core"),
          "node_modules/@ic-reactor/react": entry("react"),
          "node_modules/x/node_modules/@ic-reactor/core": entry("core", {
            integrity: "sha512-local-build",
          }),
        }),
        { installed, published }
      ),
      [
        "node_modules/x/node_modules/@ic-reactor/core has integrity sha512-local-build, not the registry's sha512-core",
      ]
    )
  })

  it("reports a link, an unrecorded package, an entry not looked up, and no lockfile", () => {
    assert.deepEqual(
      checkLockfile(
        lock({
          "node_modules/@ic-reactor/react": {
            resolved: "../../packages/react",
            link: true,
          },
          "node_modules/@ic-reactor/vite-plugin": entry("vite-plugin"),
        }),
        { installed, published }
      ),
      [
        "@ic-reactor/core is installed but package-lock.json does not record it",
        "node_modules/@ic-reactor/react is a link (to ../../packages/react) in package-lock.json, not a tarball from the registry",
        `node_modules/@ic-reactor/vite-plugin is ${BETA}: the registry's tarball for it was not looked up`,
      ]
    )
    assert.match(
      checkLockfile(undefined, { installed, published })[0],
      /no package-lock\.json/
    )
  })
})

describe("the registry", () => {
  it("pins the @ic-reactor and @candid-core scopes, not only the default registry", () => {
    assert.deepEqual(REGISTRY_ARGS, [
      `--registry=${REGISTRY}`,
      `--@ic-reactor:registry=${REGISTRY}`,
      `--@candid-core:registry=${REGISTRY}`,
    ])
  })

  it("refuses a tracked .npmrc, at the root or below it", () => {
    assert.deepEqual(trackedConfigFindings(["package.json", "src/a.ts"]), [])
    const findings = trackedConfigFindings([".npmrc", "sub/.npmrc", "npmrc.md"])
    assert.equal(findings.length, 2)
    assert.match(findings[0], /^\.npmrc is tracked: /)
    assert.match(findings[1], /^sub\/\.npmrc is tracked: /)
  })
})

describe("requiredScriptFindings", () => {
  const all = { typecheck: "tsc", test: "vitest run", build: "vite build" }

  it("requires typecheck, test and build", () => {
    assert.deepEqual(requiredScriptFindings("x", all), [])
    const { typecheck: _t, ...noTypecheck } = all
    const findings = requiredScriptFindings("x", {
      ...noTypecheck,
      "type-check": "tsc",
    })
    assert.equal(findings.length, 1)
    assert.match(findings[0], /no "typecheck" script/)
    assert.equal(requiredScriptFindings("x", undefined).length, 3)
  })

  it("lets an exception, with its reason, skip one", () => {
    const { build: _b, ...noBuild } = all
    assert.deepEqual(
      requiredScriptFindings("x", noBuild, { x: { build: "no build step" } }),
      []
    )
    assert.equal(
      requiredScriptFindings("y", noBuild, { x: { build: "no build step" } })
        .length,
      1
    )
  })
})

describe("ancestorFindings", () => {
  it("reports a node_modules or a package.json above the scratch directory", () => {
    const top = scratch()
    mkdirSync(join(top, "a", "node_modules", "leaky-pkg"), { recursive: true })
    const work = join(top, "a", "b", "c", "work")
    mkdirSync(work, { recursive: true })
    writeFileSync(join(top, "a", "b", "package.json"), "{}")
    assert.deepEqual(
      ancestorFindings(work, { stopAt: top }).map((f) => f.split(" ")[0]),
      [join(top, "a", "b", "package.json"), join(top, "a", "node_modules")]
    )
  })

  it("passes a tree with neither above it, and does not look at the directory itself", () => {
    const top = scratch()
    const work = join(top, "a", "b", "work")
    mkdirSync(join(work, "node_modules"), { recursive: true })
    writeFileSync(join(work, "package.json"), "{}")
    assert.deepEqual(ancestorFindings(work, { stopAt: top }), [])
  })
})

describe("parseArgs", () => {
  it("reads --keep, --tmp, --wait-for (dropping a leading v) and the names", () => {
    assert.deepEqual(
      parseArgs([
        "--keep",
        "--tmp",
        "/t",
        "next-ssr",
        "--wait-for",
        "v4.0.0-beta.2",
        "icrc-ledger",
      ]),
      {
        keep: true,
        tmp: "/t",
        waitFor: "4.0.0-beta.2",
        names: ["next-ssr", "icrc-ledger"],
      }
    )
    assert.match(parseArgs(["--tmp"]).error, /--tmp needs a value/)
    assert.match(parseArgs(["--tmp", "--keep"]).error, /needs a value/)
    assert.match(parseArgs(["--kep"]).error, /Unknown option --kep/)
  })
})

describe("waitForPublished", () => {
  const NEXT = "4.0.0-beta.2"
  const names = [
    "@ic-reactor/core",
    "@ic-reactor/react",
    "@ic-reactor/vite-plugin",
  ]

  /** A registry where each package serves NEXT from its `readyAt`-th poll on. */
  function registry(readyAt, { integrityLagsTag = false } = {}) {
    const polls = Object.fromEntries(names.map((n) => [n, 0]))
    const lookup = (name) => {
      const poll = ++polls[name]
      const ready = poll >= readyAt[name]
      return {
        tagged: ready ? NEXT : BETA,
        integrity:
          ready && !(integrityLagsTag && poll === readyAt[name])
            ? "sha512-x"
            : undefined,
      }
    }
    return { lookup, polls }
  }

  function clock() {
    let t = 0
    return {
      now: () => t,
      wait: async (ms) => {
        t += ms
      },
    }
  }

  it("waits until every package, not only core, is tagged and served", async () => {
    // core is published first and vite-plugin last, as release.yml does.
    const { lookup, polls } = registry({
      "@ic-reactor/core": 1,
      "@ic-reactor/react": 2,
      "@ic-reactor/vite-plugin": 4,
    })
    const lines = []
    const version = await waitForPublished(names, "beta", NEXT, {
      lookup,
      ...clock(),
      pollMs: 1,
      log: (line) => lines.push(line),
    })
    assert.equal(version, NEXT)
    assert.equal(polls["@ic-reactor/vite-plugin"], 4)
    assert.equal(lines.length, 3)
    assert.match(lines[0], /@ic-reactor\/react@beta is 4\.0\.0-beta\.1/)
    assert.match(lines[2], /@ic-reactor\/vite-plugin@beta is 4\.0\.0-beta\.1/)
    assert.doesNotMatch(lines[2], /react@beta/)
  })

  it("waits for the version's integrity once the tag names it", async () => {
    const { lookup } = registry(
      {
        "@ic-reactor/core": 1,
        "@ic-reactor/react": 1,
        "@ic-reactor/vite-plugin": 2,
      },
      { integrityLagsTag: true }
    )
    const lines = []
    await waitForPublished(names, "beta", NEXT, {
      lookup,
      ...clock(),
      pollMs: 1,
      log: (line) => lines.push(line),
    })
    assert.ok(
      lines.some((l) =>
        /vite-plugin@4\.0\.0-beta\.2 has no dist\.integrity/.test(l)
      )
    )
  })

  it("names each package still behind when it times out", async () => {
    const { lookup } = registry({
      "@ic-reactor/core": 1,
      "@ic-reactor/react": 1,
      "@ic-reactor/vite-plugin": Infinity,
    })
    await assert.rejects(
      waitForPublished(names, "beta", NEXT, {
        lookup,
        ...clock(),
        timeoutMs: 60_000,
        pollMs: 15_000,
        log: () => {},
      }),
      (error) =>
        /Not published as 4\.0\.0-beta\.2 after/.test(error.message) &&
        /vite-plugin@beta is 4\.0\.0-beta\.1/.test(error.message) &&
        !/core@beta/.test(error.message)
    )
  })
})

describe("scopePackageNames", () => {
  it("is core plus every @ic-reactor/* package the manifests declare", () => {
    assert.deepEqual(
      scopePackageNames([
        { dependencies: { "@ic-reactor/react": "^4", react: "^19" } },
        { devDependencies: { "@ic-reactor/vite-plugin": "^4" } },
        { dependencies: { "@ic-reactor/react": "^4" } },
      ]),
      ["@ic-reactor/core", "@ic-reactor/react", "@ic-reactor/vite-plugin"]
    )
    assert.deepEqual(scopePackageNames([]), ["@ic-reactor/core"])
  })

  it("covers every package the examples on this branch declare", () => {
    const manifests = [
      "icrc-ledger",
      "next-ssr",
      "node-agent-tool",
      "vite-wallet",
    ].map((name) =>
      JSON.parse(
        readFileSync(join(repoRoot, "examples", name, "package.json"), "utf8")
      )
    )
    assert.deepEqual(scopePackageNames(manifests), [
      "@ic-reactor/core",
      "@ic-reactor/react",
      "@ic-reactor/vite-plugin",
    ])
  })
})
