/**
 * Tests of the peer-floor check: how it pins each package's peers, and that
 * vite-plugin's entry runs the plugin's typecheck and tests at the floor of
 * every Vite major its range accepts, and fails when one of them fails.
 *
 * The runs go through the real check (a git worktree, `pnpm install`, the
 * package's scripts) in a repository of their own, whose vite-plugin declares
 * the real plugin's `vite` range. Its `vite` releases are stand-ins served by
 * a registry on 127.0.0.1, each exporting its version, so nothing is fetched
 * from npm and pnpm's store and cache stay in the temp directory. Its scripts
 * record the Vite version they import; a seeded fault fails one of them on the
 * 4.2 floor.
 *
 * Run by `pnpm test:scripts`; it needs `pnpm`, `git` and `tar` on the PATH.
 */
import assert from "node:assert/strict"
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import {
  CHECKS,
  PER_MAJOR,
  alternativeFloors,
  pinsFor,
  verifyPackage,
} from "./verify-peer-floors.js"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"))

const ROOT_MANIFEST = readJson(join(repoRoot, "package.json"))
const PLUGIN_MANIFEST = readJson(
  join(repoRoot, "packages", "vite-plugin", "package.json")
)
const VITE_RANGE = PLUGIN_MANIFEST.peerDependencies.vite
const VITE_FLOORS = alternativeFloors(VITE_RANGE)
const VITE_PLUGIN = CHECKS.find((check) => check.pkg === "vite-plugin")

const temps = []
function temp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  temps.push(dir)
  return dir
}
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

function writeFiles(root, files) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
}

/** A repository with `files`, committed, for the check to add worktrees of. */
function repository(files) {
  const root = temp("peer-floors-test-repo-")
  writeFiles(root, files)
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, stdio: "ignore" })
  git("init", "-q")
  git("add", "-A")
  git(
    "-c",
    "user.name=peer-floors-test",
    "-c",
    "user.email=peer-floors-test@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-q",
    "--no-verify",
    "-m",
    "seed"
  )
  return root
}

describe("the pins", () => {
  it("installs vite-plugin's Vite floors 4.2.0, 5.0.0, 6.0.0, 7.0.0 and 8.0.0, one copy per major", () => {
    assert.deepEqual(VITE_FLOORS, ["4.2.0", "5.0.0", "6.0.0", "7.0.0", "8.0.0"])
    const { overrides, devDependencies, copies } = pinsFor(VITE_PLUGIN)
    assert.deepEqual(devDependencies, {
      "vite-4": "npm:vite@4.2.0",
      "vite-5": "npm:vite@5.0.0",
      "vite-6": "npm:vite@6.0.0",
      "vite-7": "npm:vite@7.0.0",
      "vite-8": "npm:vite@8.0.0",
    })
    assert.deepEqual(
      copies.map(({ peer, installAs, version }) => [peer, installAs, version]),
      VITE_FLOORS.map((floor) => ["vite", `vite-${floor[0]}`, floor])
    )
    // The exact generator peer is pinned to itself, and vite is not
    // overridden: an override would move every copy to one version.
    assert.deepEqual(overrides, {
      "@candid-core/cli": PLUGIN_MANIFEST.peerDependencies["@candid-core/cli"],
    })
  })

  it("refuses a peer range that joins majors without a PER_MAJOR entry", () => {
    assert.throws(
      () => pinsFor(VITE_PLUGIN, { perMajor: {} }),
      /accepts vite "\^4\.2\.0 \|\| .*", which joins majors 4, 5, 6, 7, 8, but PER_MAJOR/
    )
  })

  it("refuses a major the range accepts but the entry does not install", () => {
    const { 4: _four, ...rest } = PER_MAJOR["vite-plugin"].vite
    assert.throws(
      () =>
        pinsFor(VITE_PLUGIN, { perMajor: { "vite-plugin": { vite: rest } } }),
      /vite-plugin accepts vite 4\.x, but no devDependency installs that major/
    )
  })
})

/**
 * The registry's code, run in a child process: the check blocks this one in
 * `spawnSync` while pnpm fetches. It serves `<dir>/<name>.json` (with
 * `{{REGISTRY}}` replaced by its own URL) and `<dir>/<file>.tgz`.
 */
const REGISTRY = `
import { createServer } from "node:http"
import { existsSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
const dir = process.argv[1]
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1")
  const name = decodeURIComponent(url.pathname.slice(1))
  const tarball = url.pathname.endsWith(".tgz")
  const file = tarball
    ? join(dir, basename(url.pathname))
    : join(dir, name.replace("/", "__") + ".json")
  if (!existsSync(file)) {
    res.writeHead(404, { "content-type": "application/json" })
    res.end('{"error":"not found"}')
    return
  }
  if (tarball) {
    res.writeHead(200, { "content-type": "application/octet-stream" })
    res.end(readFileSync(file))
    return
  }
  const origin = "http://127.0.0.1:" + server.address().port
  res.writeHead(200, { "content-type": "application/json" })
  res.end(readFileSync(file, "utf8").replaceAll("{{REGISTRY}}", origin))
})
server.listen(0, "127.0.0.1", () => console.log(server.address().port))
`

/**
 * Packs a stand-in `vite` for each floor and serves them; resolves to the
 * registry's URL.
 */
async function serveVite(dir) {
  const versions = {}
  for (const version of VITE_FLOORS) {
    const source = join(dir, `vite-${version}`)
    writeFiles(source, {
      "package/package.json": JSON.stringify({
        name: "vite",
        version,
        type: "module",
        main: "index.js",
        types: "index.d.ts",
      }),
      "package/index.js": `export const version = ${JSON.stringify(version)}\n`,
      "package/index.d.ts": `export declare const version: string\n`,
    })
    const file = `vite-${version}.tgz`
    execFileSync("tar", ["-czf", join(dir, file), "-C", source, "package"], {
      // No AppleDouble files from macOS's tar.
      env: { ...process.env, COPYFILE_DISABLE: "1" },
    })
    const bytes = readFileSync(join(dir, file))
    versions[version] = {
      name: "vite",
      version,
      dist: {
        tarball: `{{REGISTRY}}/vite/-/${file}`,
        shasum: createHash("sha1").update(bytes).digest("hex"),
        integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
      },
    }
  }
  writeFileSync(
    join(dir, "vite.json"),
    JSON.stringify({
      name: "vite",
      "dist-tags": { latest: VITE_FLOORS.at(-1) },
      versions,
    })
  )

  const child = spawn(
    process.execPath,
    ["--input-type=module", "-e", REGISTRY, dir],
    { stdio: ["ignore", "pipe", "inherit"] }
  )
  const port = await new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", (code) => reject(new Error(`registry exited ${code}`)))
    child.stdout.once("data", (data) => resolve(String(data).trim()))
  })
  return { url: `http://127.0.0.1:${port}/`, stop: () => child.kill() }
}

/**
 * A script of the seeded plugin: it records `<name> <the Vite it imports>` in
 * the log, and exits 1 on the floor `failOn` names.
 */
const step = (name, failOn) => `import { appendFileSync } from "node:fs"
import { version } from "vite"
appendFileSync(process.env.PEER_FLOORS_TEST_LOG, ${JSON.stringify(name)} + " " + version + "\\n")
if (version === ${JSON.stringify(failOn ?? null)}) {
  console.error(${JSON.stringify(name)} + " fails on vite " + version)
  process.exit(1)
}
`

describe("vite-plugin at its Vite floors", () => {
  let registry
  let work
  before(async () => {
    work = temp("peer-floors-test-")
    registry = await serveVite(join(work, "registry"))
  })
  after(() => registry?.stop())

  /**
   * A repository whose vite-plugin declares the real `vite` range and whose
   * typecheck and test scripts record the Vite they import, failing where
   * `fail` says; resolves to its root and the recorded runs.
   */
  function seeded(fail = {}) {
    const root = repository({
      "package.json": JSON.stringify({
        name: "peer-floors-seed",
        private: true,
        packageManager: ROOT_MANIFEST.packageManager,
      }),
      "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
      ".npmrc": [
        `registry=${registry.url}`,
        `store-dir=${join(work, "store")}`,
        `cache-dir=${join(work, "cache")}`,
        "",
      ].join("\n"),
      "packages/vite-plugin/package.json": JSON.stringify({
        name: "@ic-reactor/vite-plugin",
        private: true,
        type: "module",
        scripts: { typecheck: "node typecheck.mjs", test: "node test.mjs" },
        peerDependencies: { vite: VITE_RANGE },
      }),
      "packages/vite-plugin/typecheck.mjs": step("typecheck", fail.typecheck),
      "packages/vite-plugin/test.mjs": step("test", fail.test),
    })
    const log = join(root, "..", `${root.split("/").at(-1)}.log`)
    writeFileSync(log, "")
    temps.push(log)
    return {
      root,
      run: () => {
        const saved = process.env.PEER_FLOORS_TEST_LOG
        process.env.PEER_FLOORS_TEST_LOG = log
        try {
          return verifyPackage(VITE_PLUGIN, { rootDir: root })
        } finally {
          if (saved === undefined) delete process.env.PEER_FLOORS_TEST_LOG
          else process.env.PEER_FLOORS_TEST_LOG = saved
        }
      },
      runs: () => readFileSync(log, "utf8").trim().split("\n"),
    }
  }

  const worktrees = (root) =>
    execFileSync("git", ["worktree", "list", "--porcelain"], {
      cwd: root,
      encoding: "utf8",
    })
      .split("\n")
      .filter((line) => line.startsWith("worktree "))

  it("runs the typecheck and the tests at the floor of each Vite major, and passes", () => {
    const seed = seeded()
    assert.deepEqual(seed.run(), [])
    assert.deepEqual(
      seed.runs(),
      VITE_FLOORS.flatMap((floor) => [`typecheck ${floor}`, `test ${floor}`])
    )
    // The worktree is gone again.
    assert.equal(worktrees(seed.root).length, 1)
  })

  it("fails when the plugin's tests break on the 4.2 floor, and still runs the other majors", () => {
    const seed = seeded({ test: "4.2.0" })
    assert.deepEqual(seed.run(), ["vite-plugin at vite 4.2.0: test"])
    assert.deepEqual(
      seed.runs(),
      VITE_FLOORS.flatMap((floor) => [`typecheck ${floor}`, `test ${floor}`])
    )
    assert.equal(worktrees(seed.root).length, 1)
  })

  it("fails when the plugin's typecheck breaks on the 4.2 floor, without running its tests there", () => {
    const seed = seeded({ typecheck: "4.2.0" })
    assert.deepEqual(seed.run(), ["vite-plugin at vite 4.2.0: typecheck"])
    assert.deepEqual(seed.runs(), [
      "typecheck 4.2.0",
      ...VITE_FLOORS.slice(1).flatMap((floor) => [
        `typecheck ${floor}`,
        `test ${floor}`,
      ]),
    ])
  })
})
