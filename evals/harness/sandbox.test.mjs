// Proves the agent sandbox works both ways, on a run directory built exactly
// as the driver builds it: the toolchain works inside (tsc, the public vitest
// smoke test), and reads outside the run — the repository's hidden tests, a
// sibling run of the same batch, the scorer's directory, the home directory —
// and writes into the repository are refused. Every refusal is paired with the
// same command outside the sandbox, which must succeed, so a pass is not
// vacuous. Skipped where sandbox-exec does not exist.
//
//   node --test harness/sandbox.test.mjs
import { strict as assert } from "node:assert"
import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, describe, it } from "node:test"
import { EVALS } from "./assemble.mjs"
import { agentEnv, makeBatchDir, prepareRun, REPO } from "./runs.mjs"
import { nodeInstallDir, sandboxAvailable, sandboxPrefix } from "./sandbox.mjs"

const skip = !sandboxAvailable() && "sandbox-exec is not available here"

let batch
let run
let sibling
let prefix
const scoreDir = join(tmpdir(), "ic-reactor-evals-score")
const hidden = join(
  EVALS,
  "tasks",
  "react-wallet",
  "hidden",
  "react-wallet.test.ts"
)

function inSandbox(command, timeout = 180_000) {
  return spawnSync(prefix[0], [...prefix.slice(1), "sh", "-c", command], {
    cwd: run.work,
    env: agentEnv(run),
    encoding: "utf8",
    timeout,
  })
}
function outside(command) {
  return spawnSync("sh", ["-c", command], { cwd: run.work, encoding: "utf8" })
}
const readCmd = (path) =>
  `node -e 'process.stdout.write(require("fs").readFileSync(${JSON.stringify(path)}, "utf8").slice(0, 20))'`

describe("the agent sandbox", { skip }, () => {
  before(() => {
    batch = makeBatchDir()
    run = prepareRun({
      batchDir: batch,
      task: "react-wallet",
      condition: "v4-proto",
      i: 1,
      mode: "sandboxed",
    })
    // A working solution, so the public smoke test can pass inside.
    cpSync(
      join(
        EVALS,
        "tasks",
        "react-wallet",
        "solutions",
        "v4-proto",
        "reference",
        "src"
      ),
      join(run.work, "src"),
      { recursive: true }
    )
    sibling = join(batch, "react-wallet--thin--002", "work")
    mkdirSync(sibling, { recursive: true })
    writeFileSync(join(sibling, "secret.txt"), "another run's file")
    mkdirSync(scoreDir, { recursive: true, mode: 0o700 })
    writeFileSync(join(scoreDir, "probe.txt"), "a scoring file")
    prefix = sandboxPrefix({
      runRoot: run.runRoot,
      readOnly: [nodeInstallDir()],
    })
  })
  after(() => {
    rmSync(batch, { recursive: true, force: true })
    rmSync(join(scoreDir, "probe.txt"), { force: true })
  })

  it("runs tsc inside the run", () => {
    const r = inSandbox("npx tsc --noEmit")
    assert.equal(r.status, 0, r.stdout + r.stderr)
  })

  it("runs the public vitest smoke test inside the run", () => {
    const r = inSandbox("npx vitest run --reporter=dot", 300_000)
    assert.equal(r.status, 0, (r.stdout + r.stderr).slice(-3000))
  })

  it("can write inside the run", () => {
    const r = inSandbox("echo ok > scratch.txt && cat scratch.txt")
    assert.equal(r.stdout.trim(), "ok", r.stderr)
  })

  const refusals = {
    "the repository's hidden tests": () => readCmd(hidden),
    "a directory listing of the repository's evals/": () =>
      `ls ${JSON.stringify(EVALS)}`,
    "a sibling run of the same batch": () =>
      readCmd(join(sibling, "secret.txt")),
    "the scorer's private directory": () =>
      readCmd(join(scoreDir, "probe.txt")),
    "the home directory": () => `ls ${JSON.stringify(homedir())}`,
  }
  for (const [what, command] of Object.entries(refusals)) {
    it(`refuses reading ${what}`, () => {
      const control = outside(command())
      assert.equal(
        control.status,
        0,
        `control failed, test would be vacuous: ${control.stderr}`
      )
      const r = inSandbox(command())
      assert.notEqual(r.status, 0, `read succeeded: ${r.stdout}`)
      assert.match(r.stderr, /Operation not permitted|EPERM/)
    })
  }

  it("refuses writing into the repository", () => {
    const target = join(EVALS, "sandbox-write-probe.txt")
    const r = inSandbox(`echo x > ${JSON.stringify(target)}`)
    assert.notEqual(r.status, 0)
    assert.equal(existsSync(target), false)
    assert.ok(REPO.length > 0)
  })
})
