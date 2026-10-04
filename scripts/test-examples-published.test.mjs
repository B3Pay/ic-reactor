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
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import { after, describe, it } from "node:test"
import {
  REGISTRY,
  checkInstalled,
  checkManifest,
  isolatedEnv,
  pageScripts,
  scriptOf,
  stackblitzStartCommand,
} from "./test-examples-published.mjs"

const BETA = "4.0.0-beta.1"

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

  it("names the package script a start command runs", () => {
    assert.equal(scriptOf("npm test"), "test")
    assert.equal(scriptOf("npm t"), "test")
    assert.equal(scriptOf("npm run test"), "test")
    assert.equal(scriptOf("npm run dev"), "dev")
    assert.equal(scriptOf("npm run-script gen:check"), "gen:check")
    assert.equal(scriptOf("npm run dev -- --host"), undefined)
    assert.equal(scriptOf("node src/cli.ts demo"), undefined)
  })
})

describe("pageScripts", () => {
  it("lists the page's own scripts as absolute URLs, once each", () => {
    const html = `<!doctype html><html><head>
      <script type="module" src="/@vite/client"></script>
      <script type="module" src="/src/main.tsx"></script>
      <script src="/_next/static/chunks/a.js?v=1&amp;x=2" async=""></script>
      <script src="/src/main.tsx"></script>
      <script src="https://cdn.example.com/lib.js"></script>
      <script>inline()</script>
    </head></html>`
    assert.deepEqual(pageScripts(html, "http://localhost:5173/"), [
      "http://localhost:5173/@vite/client",
      "http://localhost:5173/src/main.tsx",
      "http://localhost:5173/_next/static/chunks/a.js?v=1&x=2",
    ])
  })
})
