/**
 * Tests of the Pages site assembly that .github/workflows/docs.yml runs
 * (scripts/assemble-docs-site.mjs), on directories built for the purpose: a
 * `gh-pages` checkout holding the legacy 2.x root, a 4.x build, and a `v3`
 * branch checkout with its build and root guides.
 *
 * After the 4.0 GA flip the site root belongs to 4.x: `/` and the 404 page go
 * to `/v4/`, `/llms.txt` is the 4.x guide, and the selector offers v4, v3 and
 * v2 with v4 first. `/v3/` is rebuilt from `v3` (option A) or kept from a
 * static snapshot (option B), and never dropped.
 *
 * Run by `pnpm test:scripts`.
 */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { after, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"
import { assembleSite } from "./assemble-docs-site.mjs"

const scriptsDir = dirname(fileURLToPath(import.meta.url))

const temps = []
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

function write(path, text) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

const SELECTOR = (selected) =>
  `<select id="version-select" onchange="handleVersionChange(event)" aria-label="Select version">
        <option value="${selected}" selected>${selected}</option>
      </select>`

const page = (line, body = "") =>
  `<!doctype html><html><body>${SELECTOR(line)}<p>${line} page</p>${body}</body></html>`

/** A workspace as docs.yml leaves it before the assembly step. */
function workspace({ ghPages = true, v3Snapshot = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "assemble-docs-"))
  temps.push(root)
  if (ghPages) {
    // The legacy root of gh-pages: the 2.x TypeDoc site and stale root guides.
    write(join(root, "existing-pages/index.html"), "<p>2.x home</p>")
    write(
      join(root, "existing-pages/modules/core.html"),
      '<a href="https://ic-reactor.b3pay.net/ic-reactor/modules.html">2.x</a>'
    )
    write(join(root, "existing-pages/llms.txt"), "stale root llms")
    write(join(root, "existing-pages/llms-full.txt"), "stale root llms-full")
    write(join(root, "existing-pages/.git/HEAD"), "ref: refs/heads/gh-pages")
    if (v3Snapshot) {
      write(join(root, "existing-pages/v3/index.html"), page("v3", "snapshot"))
    }
  }
  write(join(root, "docs/dist/index.html"), page("v4"))
  write(join(root, "docs/dist/guides/client/index.html"), page("v4"))
  write(join(root, "v3-line/docs/dist/index.html"), page("v3", "rebuilt"))
  write(
    join(root, "v3-line/docs/dist/packages/core/index.html"),
    page(
      "v3",
      '<a href="https://b3pay.github.io/ic-reactor/modules/core.html">old</a>'
    )
  )
  write(join(root, "v3-line/llms.txt"), "3.x llms")
  write(join(root, "v3-line/llms-full.txt"), "3.x llms-full")
  write(join(root, "packages/core/llms.txt"), "4.x guide")
  write(join(root, "CNAME"), "ic-reactor.b3pay.net\n")
  return root
}

/** docs.yml's default call: option (A), the frozen 3.x llms-full at the root. */
function assembleDefault(root, overrides = {}) {
  assembleSite({
    out: join(root, "final-docs"),
    existing: join(root, "existing-pages"),
    v4: join(root, "docs/dist"),
    v3Line: join(root, "v3-line"),
    rootLlms: join(root, "packages/core/llms.txt"),
    rootLlmsFull: join(root, "v3-line/llms-full.txt"),
    cname: join(root, "CNAME"),
    log: () => {},
    ...overrides,
  })
  return join(root, "final-docs")
}

const read = (path) => readFileSync(path, "utf8")

/**
 * Runs the inline script of a generated redirect page against a stub
 * `window.location` at `pathname`, and returns where it sends the browser.
 */
function redirectTarget(html, pathname) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  assert.equal(scripts.length, 1, "one inline script")
  let target
  const location = {
    pathname,
    replace(url) {
      target = url
    },
  }
  runInNewContext(scripts[0][1], { window: { location } })
  return target
}

describe("assembleSite, option (A): /v3/ rebuilt from the v3 branch", () => {
  it("publishes /v4/ from this commit and /v3/ from the v3 branch", () => {
    const out = assembleDefault(workspace())
    assert.match(read(join(out, "v4/index.html")), /v4 page/)
    assert.match(read(join(out, "v4/guides/client/index.html")), /v4 page/)
    assert.match(read(join(out, "v3/index.html")), /rebuilt/)
    assert.equal(read(join(out, "v3/llms.txt")), "3.x llms")
    assert.equal(read(join(out, "v3/llms-full.txt")), "3.x llms-full")
  })

  it("moves the legacy 2.x root under /v2/ and drops gh-pages' .git", () => {
    const out = assembleDefault(workspace())
    assert.equal(read(join(out, "v2/index.html")), "<p>2.x home</p>")
    assert.match(
      read(join(out, "v2/modules/core.html")),
      /href="\/v2\/modules\.html"/
    )
    assert.equal(existsSync(join(out, ".git")), false)
    assert.equal(existsSync(join(out, "v2/.git")), false)
  })

  it("sends the root and unknown paths to /v4/", () => {
    const out = assembleDefault(workspace())
    const index = read(join(out, "index.html"))
    assert.match(index, /url=\/v4\//)
    assert.match(index, /window\.location\.replace\("\/v4\/"\)/)
    assert.doesNotMatch(index, /\/v3\//)
    const notFound = read(join(out, "404.html"))
    assert.match(notFound, /window\.location\.replace\("\/v4" \+ path\)/)
    assert.match(notFound, /\(v2\|v3\|v4\)/)
    assert.doesNotMatch(notFound, /"\/v3" \+ path/)
  })

  it("redirects a miss to the line it is under, and any other path to /v4/", () => {
    const out = assembleDefault(workspace())
    assert.equal(redirectTarget(read(join(out, "index.html")), "/"), "/v4/")
    const notFound = read(join(out, "404.html"))
    for (const [path, target] of [
      ["/v4/missing", "/v4/"],
      ["/v4/guides/missing/", "/v4/"],
      ["/v4", "/v4/"],
      ["/v3/x", "/v3/"],
      ["/v2/modules/missing.html", "/v2/"],
      ["/foo", "/v4/foo"],
      ["/guides/client/", "/v4/guides/client/"],
      ["/v5/x", "/v4/v5/x"],
      ["/v40/x", "/v4/v40/x"],
    ]) {
      assert.equal(redirectTarget(notFound, path), target, path)
    }
  })

  it("serves the 4.x guide at /llms.txt and the frozen 3.x file at /llms-full.txt", () => {
    const out = assembleDefault(workspace())
    assert.equal(read(join(out, "llms.txt")), "4.x guide")
    assert.equal(read(join(out, "llms-full.txt")), "3.x llms-full")
  })

  it("serves no /llms-full.txt when none is named", () => {
    const out = assembleDefault(workspace(), { rootLlmsFull: undefined })
    assert.equal(existsSync(join(out, "llms-full.txt")), false)
  })

  it("gives every page the v4, v3, v2 selector with v4 as the default", () => {
    const out = assembleDefault(workspace())
    for (const file of [
      "v4/index.html",
      "v3/index.html",
      "v3/packages/core/index.html",
    ]) {
      const html = read(join(out, file))
      const options = [...html.matchAll(/<option value="(v\d)"/g)].map(
        (m) => m[1]
      )
      assert.deepEqual(options, ["v4", "v3", "v2"], file)
      assert.doesNotMatch(html, /in development/, file)
      assert.match(
        html,
        /var currentVersion = match \? match\[1\] : "v4";/,
        file
      )
      assert.equal(
        html.match(/ic-reactor-version-selector-patch/g).length,
        1,
        file
      )
    }
  })

  it("rewrites the old TypeDoc links of the 3.x pages", () => {
    const out = assembleDefault(workspace())
    assert.match(
      read(join(out, "v3/packages/core/index.html")),
      /href="\/v3\/packages\/core\/"/
    )
  })

  it("keeps the custom domain", () => {
    const out = assembleDefault(workspace())
    assert.equal(read(join(out, "CNAME")), "ic-reactor.b3pay.net\n")
  })

  it("assembles a first deploy without gh-pages", () => {
    const out = assembleDefault(workspace({ ghPages: false }))
    assert.equal(existsSync(join(out, "v2")), true)
    assert.match(read(join(out, "v3/index.html")), /rebuilt/)
  })

  it("replaces a /v3/ snapshot of the existing site with the rebuild", () => {
    const out = assembleDefault(workspace({ v3Snapshot: true }))
    assert.match(read(join(out, "v3/index.html")), /rebuilt/)
    assert.doesNotMatch(read(join(out, "v3/index.html")), /snapshot/)
  })

  it("refuses a v3 checkout whose docs were not built", () => {
    const root = workspace()
    rmSync(join(root, "v3-line/docs/dist"), { recursive: true })
    assert.throws(() => assembleDefault(root), /holds no built 3\.x docs/)
  })

  it("refuses to write into a directory that holds files", () => {
    const root = workspace()
    write(join(root, "final-docs/leftover.html"), "x")
    assert.throws(() => assembleDefault(root), /is not empty/)
  })
})

describe("assembleSite, option (B): a static /v3/ snapshot", () => {
  it("keeps the /v3/ of the existing site", () => {
    const out = assembleDefault(workspace({ v3Snapshot: true }), {
      v3Line: undefined,
      rootLlmsFull: undefined,
    })
    assert.match(read(join(out, "v3/index.html")), /snapshot/)
    assert.match(read(join(out, "v4/index.html")), /v4 page/)
  })

  it("refuses to publish a site without /v3/", () => {
    assert.throws(
      () => assembleDefault(workspace(), { v3Line: undefined }),
      /refusing to publish a site without the 3\.x docs/
    )
  })
})

describe("assemble-docs-site.mjs as docs.yml runs it", () => {
  it("assembles the site from the command line", () => {
    const root = workspace()
    const result = spawnSync(
      process.execPath,
      [
        join(scriptsDir, "assemble-docs-site.mjs"),
        "--out",
        "final-docs",
        "--existing",
        "existing-pages",
        "--v4",
        "docs/dist",
        "--v3-line",
        "v3-line",
        "--root-llms",
        "packages/core/llms.txt",
        "--root-llms-full",
        "v3-line/llms-full.txt",
        "--cname",
        "CNAME",
      ],
      { cwd: root, encoding: "utf8" }
    )
    assert.equal(result.status, 0, result.stderr)
    assert.equal(read(join(root, "final-docs/llms.txt")), "4.x guide")
    assert.match(read(join(root, "final-docs/v3/index.html")), /rebuilt/)
  })

  it("exits 1 with the reason when a build is missing", () => {
    const root = workspace()
    const result = spawnSync(
      process.execPath,
      [
        join(scriptsDir, "assemble-docs-site.mjs"),
        "--out",
        "final-docs",
        "--v4",
        "missing/dist",
        "--v3-line",
        "v3-line",
        "--root-llms",
        "packages/core/llms.txt",
      ],
      { cwd: root, encoding: "utf8" }
    )
    assert.equal(result.status, 1)
    assert.match(result.stderr, /::error::missing\/dist holds no built docs/)
  })
})
