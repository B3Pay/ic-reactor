// End-to-end tests of the driver's authentication handling, with a stub agent
// (never the real `claude` binary): the credential chosen, that its value
// never lands in anything written to the results directory, and that a
// usage/rate limit is a harness error rather than a failed solution.
//
//   node --test harness/drive-auth.test.mjs
import { strict as assert } from "node:assert"
import { spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, describe, it } from "node:test"
import { EVALS } from "./assemble.mjs"

const solutions = join(EVALS, "tasks")
const OAUTH = `sk-ant-oat01-FAKE-${Math.random().toString(36).slice(2)}-TOKEN`
const API_KEY = `sk-ant-api03-FAKE-${Math.random().toString(36).slice(2)}-KEY`
const RESULT_OK =
  '{"type":"result","subtype":"success","is_error":false,"num_turns":3,"usage":{"input_tokens":10,"output_tokens":5},"total_cost_usd":0}'

function drive(out, agentCmd, env, extra = [], n = "1") {
  return spawnSync(
    process.execPath,
    [
      join(EVALS, "drive.mjs"),
      "--task",
      "node-tool",
      "--condition",
      "thin",
      "--n",
      n,
      "--model",
      "stub",
      "--agent-cmd",
      agentCmd,
      "--sandbox-allow",
      solutions,
      "--out",
      out,
      ...extra,
    ],
    {
      cwd: EVALS,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
      encoding: "utf8",
      timeout: 600_000,
    }
  )
}

/** Every file under `dir`, with its contents. */
function files(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...files(p))
    else out.push([p, readFileSync(p, "latin1")])
  }
  return out
}

describe("a subscription token (with an API key also set)", () => {
  let out
  let result
  before(() => {
    out = mkdtempSync(join(tmpdir(), "drive-auth-"))
    // A hostile stub: it copies a working solution, then dumps its whole
    // environment into its transcript, its stderr and a file in the solution.
    const stub =
      `cp -R '${solutions}/{task}/solutions/{condition}/reference/src/.' src/ && ` +
      "env > src/leaked-env.txt && env >&2 && " +
      `echo "api key passed: \${ANTHROPIC_API_KEY:-no-api-key}" && ` +
      `echo "{\\"type\\":\\"system\\",\\"token\\":\\"$CLAUDE_CODE_OAUTH_TOKEN\\"}" && ` +
      `echo '${RESULT_OK}'`
    result = drive(out, stub, {
      CLAUDE_CODE_OAUTH_TOKEN: OAUTH,
      ANTHROPIC_API_KEY: API_KEY,
    })
  })
  after(() => rmSync(out, { recursive: true, force: true }))

  it("runs, and says which kind of auth without the value", () => {
    assert.equal(result.status, 0, result.stderr.slice(-2000))
    assert.match(
      result.stdout,
      /auth: Claude subscription token from CLAUDE_CODE_OAUTH_TOKEN \(ANTHROPIC_API_KEY is set but not passed\)/
    )
    assert.ok(!result.stdout.includes(OAUTH) && !result.stderr.includes(OAUTH))
  })

  it("passes only the OAuth token to the agent", () => {
    const stdout = readFileSync(
      join(out, "node-tool", "thin", "001", "agent.stdout"),
      "utf8"
    )
    assert.match(stdout, /api key passed: no-api-key/)
    assert.match(stdout, /\[REDACTED\]/)
  })

  it("never writes either credential value anywhere under the results directory", () => {
    const written = files(out)
    assert.ok(written.length > 5)
    for (const [path, text] of written) {
      assert.ok(!text.includes(OAUTH), `OAuth token in ${path}`)
      assert.ok(!text.includes(API_KEY), `API key in ${path}`)
    }
  })

  it("records the auth kind in the plan, the run and the summary", () => {
    const plan = JSON.parse(readFileSync(join(out, "plan.json"), "utf8"))
    const agent = JSON.parse(
      readFileSync(join(out, "node-tool", "thin", "001", "agent.json"), "utf8")
    )
    const score = JSON.parse(
      readFileSync(join(out, "node-tool", "thin", "001", "score.json"), "utf8")
    )
    const summary = JSON.parse(readFileSync(join(out, "summary.json"), "utf8"))
    assert.equal(plan.args.auth, "oauth")
    assert.equal(agent.auth, "oauth")
    assert.equal(score.auth, "oauth")
    assert.equal(score.safe, true)
    assert.deepEqual(summary.auth, { oauth: 1 })
  })
})

describe("a usage limit", () => {
  let out
  let result
  before(() => {
    out = mkdtempSync(join(tmpdir(), "drive-ratelimit-"))
    // An error result as the CLI reports a subscription limit; it echoes the
    // token, to check that recorded error texts are redacted too.
    const stub =
      `printf '%s\\n' '{"type":"result","subtype":"error_during_execution","is_error":true,` +
      `"result":"Claude AI usage limit reached for '"$CLAUDE_CODE_OAUTH_TOKEN"'|1000000000"}'`
    result = drive(out, stub, { CLAUDE_CODE_OAUTH_TOKEN: OAUTH }, [
      "--rate-limit-retries",
      "1",
      "--rate-limit-backoff-min",
      "0",
    ])
  })
  after(() => rmSync(out, { recursive: true, force: true }))

  it("is retried, then excluded as a rate-limit harness error, never scored", () => {
    assert.equal(result.status, 0, result.stderr.slice(-2000))
    assert.match(result.stderr, /rate limited/)
    const dir = join(out, "node-tool", "thin", "001")
    const names = readdirSync(dir)
    assert.ok(
      !names.includes("agent.json"),
      "a rate-limited run must not be scored"
    )
    assert.equal(
      names.filter(
        (n) => n.startsWith("rate-limited-") && n.endsWith(".stdout")
      ).length,
      2
    )
    const score = JSON.parse(readFileSync(join(dir, "score.json"), "utf8"))
    assert.equal(score.harnessKind, "rate_limited")
    assert.equal(score.safe, undefined)
    const summary = JSON.parse(readFileSync(join(out, "summary.json"), "utf8"))
    assert.equal(summary.harnessErrors, 1)
    assert.deepEqual(summary.harnessErrorKinds, { rate_limited: 1 })
  })

  it("keeps the token out of the recorded limit message", () => {
    for (const [path, text] of files(out)) {
      assert.ok(!text.includes(OAUTH), `OAuth token in ${path}`)
    }
  })
})

describe("a resumed batch", () => {
  let out
  let marker
  let first
  let resumed
  before(() => {
    out = mkdtempSync(join(tmpdir(), "drive-resume-"))
    marker = join(mkdtempSync(join(tmpdir(), "drive-resume-marker-")), "ok")
    // Rate limited until the marker exists, then a working solution.
    const stub =
      `if [ -e '${marker}' ]; then ` +
      `cp -R '${solutions}/{task}/solutions/{condition}/reference/src/.' src/ && echo '${RESULT_OK}'; ` +
      `else printf '%s\\n' '{"type":"result","subtype":"error_during_execution","is_error":true,` +
      `"result":"Claude AI usage limit reached|1000000000"}'; fi`
    first = drive(out, stub, { CLAUDE_CODE_OAUTH_TOKEN: OAUTH }, [
      "--rate-limit-retries",
      "0",
      "--rate-limit-backoff-min",
      "0",
    ])
    writeFileSync(marker, "")
    resumed = spawnSync(
      process.execPath,
      [join(EVALS, "drive.mjs"), "--resume", out],
      {
        cwd: EVALS,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          CLAUDE_CODE_OAUTH_TOKEN: OAUTH,
        },
        encoding: "utf8",
        timeout: 600_000,
      }
    )
  })
  after(() => {
    rmSync(out, { recursive: true, force: true })
    rmSync(join(marker, ".."), { recursive: true, force: true })
  })

  it("runs a run excluded as a harness error again, and scores it", () => {
    assert.equal(first.status, 0, first.stderr.slice(-2000))
    assert.equal(resumed.status, 0, resumed.stderr.slice(-2000))
    const dir = join(out, "node-tool", "thin", "001")
    assert.ok(existsSync(join(dir, "agent.json")))
    const score = JSON.parse(readFileSync(join(dir, "score.json"), "utf8"))
    assert.equal(score.harnessError, undefined, score.harnessError)
    assert.equal(score.safe, true)
    const summary = JSON.parse(readFileSync(join(out, "summary.json"), "utf8"))
    assert.equal(summary.harnessErrors, 0)
  })
})

describe("a token file", () => {
  let out
  let dir
  let file
  let result
  // Different lengths, so the stub can tell which one it was given without
  // printing either.
  const FILE_TOKEN = `sk-ant-oat01-FILE-${Math.random().toString(36).slice(2)}-TOKEN-FROM-FILE`
  const ENV_TOKEN = `sk-ant-oat01-ENV-${Math.random().toString(36).slice(2)}`
  before(() => {
    out = mkdtempSync(join(tmpdir(), "drive-tokenfile-"))
    dir = mkdtempSync(join(tmpdir(), "drive-tokenfile-secret-"))
    file = join(dir, "token")
    writeFileSync(file, `  ${FILE_TOKEN}\n`)
    chmodSync(file, 0o600)
    const stub =
      `cp -R '${solutions}/{task}/solutions/{condition}/reference/src/.' src/ && ` +
      "env > src/leaked-env.txt && env && " +
      `echo "token length: \${#CLAUDE_CODE_OAUTH_TOKEN}; api key: \${ANTHROPIC_API_KEY:-no-api-key}" && ` +
      `echo '${RESULT_OK}'`
    result = drive(
      out,
      stub,
      { CLAUDE_CODE_OAUTH_TOKEN: ENV_TOKEN, ANTHROPIC_API_KEY: API_KEY },
      ["--oauth-token-file", file]
    )
  })
  after(() => {
    rmSync(out, { recursive: true, force: true })
    rmSync(dir, { recursive: true, force: true })
  })

  it("takes precedence over both environment variables, trimmed", () => {
    assert.equal(result.status, 0, result.stderr.slice(-2000))
    assert.match(
      result.stdout,
      /Claude subscription token from --oauth-token-file/
    )
    const stdout = readFileSync(
      join(out, "node-tool", "thin", "001", "agent.stdout"),
      "utf8"
    )
    assert.match(
      stdout,
      new RegExp(`token length: ${FILE_TOKEN.length}; api key: no-api-key`)
    )
  })

  it("never writes the file's token (or the others) anywhere", () => {
    for (const [path, text] of files(out)) {
      for (const secret of [FILE_TOKEN, ENV_TOKEN, API_KEY]) {
        assert.ok(!text.includes(secret), `a credential in ${path}`)
      }
    }
    assert.ok(
      !result.stdout.includes(FILE_TOKEN) && !result.stderr.includes(FILE_TOKEN)
    )
    const plan = JSON.parse(readFileSync(join(out, "plan.json"), "utf8"))
    assert.equal(plan.args.authSource, "--oauth-token-file")
  })

  it("is refused when group- or world-readable, without printing it", () => {
    chmodSync(file, 0o644)
    const refused = drive(
      mkdtempSync(join(tmpdir(), "drive-tokenfile-refused-")),
      "true",
      {},
      ["--oauth-token-file", file]
    )
    assert.equal(refused.status, 2)
    assert.match(refused.stderr, /chmod 600/)
    assert.ok(
      !refused.stderr.includes(FILE_TOKEN) &&
        !refused.stdout.includes(FILE_TOKEN)
    )
    chmodSync(file, 0o600)
  })
})

describe("a sign-in failure", () => {
  let out
  let result
  before(() => {
    out = mkdtempSync(join(tmpdir(), "drive-signin-"))
    // The shape CLI 2.1.285 returns with an isolated config and no credential.
    const stub =
      `printf '%s\\n' '{"type":"result","subtype":"success","is_error":true,` +
      `"result":"Not logged in · Please run /login","api_error_status":null}'`
    result = drive(
      out,
      stub,
      { CLAUDE_CODE_OAUTH_TOKEN: OAUTH },
      ["--jobs", "1"],
      "3"
    )
  })
  after(() => rmSync(out, { recursive: true, force: true }))

  it("stops the whole batch at once with a clear message", () => {
    assert.equal(result.status, 2)
    assert.match(
      result.stderr,
      /could not sign in, so the batch was stopped at once/
    )
    assert.match(result.stderr, /Not logged in/)
    assert.match(result.stderr, /--resume/)
    // One run was attempted; the other two never started.
    const cellDirs = readdirSync(join(out, "node-tool", "thin"))
    assert.equal(cellDirs.length, 1)
  })

  it("records nothing as a result", () => {
    const dir = join(out, "node-tool", "thin", "001")
    assert.ok(!existsSync(join(dir, "agent.json")))
    assert.ok(!existsSync(join(dir, "score.json")))
    assert.ok(!existsSync(join(out, "summary.json")))
  })
})

describe("the preflight (with a stub CLI in its place)", () => {
  const preflight = (stub, env) =>
    spawnSync(
      process.execPath,
      [
        join(EVALS, "drive.mjs"),
        "--preflight",
        "--model",
        "stub",
        "--preflight-cmd",
        stub,
      ],
      {
        cwd: EVALS,
        env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
        encoding: "utf8",
        timeout: 120_000,
      }
    )

  it("passes on a successful result", () => {
    const r = preflight(
      `printf '%s\\n' '{"type":"result","subtype":"success","is_error":false,"result":"ok","num_turns":1}'`,
      { CLAUDE_CODE_OAUTH_TOKEN: OAUTH }
    )
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /preflight ok/)
  })

  it("stops with the CLI's result text otherwise, token redacted", () => {
    const r = preflight(
      `printf '%s\\n' '{"type":"result","subtype":"success","is_error":true,` +
        `"result":"Not logged in · Please run /login ('"$CLAUDE_CODE_OAUTH_TOKEN"')"}'`,
      { CLAUDE_CODE_OAUTH_TOKEN: OAUTH }
    )
    assert.equal(r.status, 2)
    assert.match(
      r.stderr,
      /preflight failed \(sign_in_error\): the CLI said: Not logged in/
    )
    assert.ok(!r.stderr.includes(OAUTH), "token in the preflight error")
  })

  it("refuses to run without any credential", () => {
    const r = preflight("true", {})
    assert.equal(r.status, 2)
    assert.match(r.stderr, /claude setup-token/)
  })
})

describe("the prompt variant (with a stub agent)", () => {
  let out
  let result
  before(() => {
    out = mkdtempSync(join(tmpdir(), "drive-prompt-"))
    const stub =
      `cp -R '${solutions}/{task}/solutions/{condition}/reference/src/.' src/ && ` +
      `cp {prompt} src/prompt-seen.md && echo '${RESULT_OK}'`
    result = drive(out, stub, { CLAUDE_CODE_OAUTH_TOKEN: OAUTH }, [
      "--prompt",
      "minimal",
    ])
  })
  after(() => rmSync(out, { recursive: true, force: true }))

  it("gives the agent the minimal prompt and records the variant everywhere", () => {
    assert.equal(result.status, 0, result.stderr.slice(-2000))
    const run = join(out, "node-tool", "thin", "001")
    const seen = readFileSync(
      join(run, "solution", "src", "prompt-seen.md"),
      "utf8"
    )
    const task = readFileSync(join(run, "solution", "TASK.md"), "utf8")
    assert.equal(seen, task)
    assert.match(seen, /`mayHaveExecuted`/)
    assert.doesNotMatch(seen, /reject code/i)
    const plan = JSON.parse(readFileSync(join(out, "plan.json"), "utf8"))
    const agent = JSON.parse(readFileSync(join(run, "agent.json"), "utf8"))
    const score = JSON.parse(readFileSync(join(run, "score.json"), "utf8"))
    const summary = JSON.parse(readFileSync(join(out, "summary.json"), "utf8"))
    assert.equal(plan.args.prompt, "minimal")
    assert.equal(agent.prompt, "minimal")
    assert.equal(score.prompt, "minimal")
    assert.deepEqual(summary.prompt, { minimal: 1 })
    assert.equal(summary.main.cells[0].prompt, "minimal")
  })

  it("refuses to resume the batch with another variant", () => {
    const r = spawnSync(
      process.execPath,
      [
        join(EVALS, "drive.mjs"),
        "--resume",
        out,
        "--prompt",
        "explicit",
        "--dry-run",
      ],
      {
        cwd: EVALS,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          CLAUDE_CODE_OAUTH_TOKEN: OAUTH,
        },
        encoding: "utf8",
      }
    )
    assert.notEqual(r.status, 0)
    assert.match(
      r.stderr,
      /--prompt minimal batch; it cannot be resumed with --prompt explicit/
    )
  })

  it("refuses an unknown variant", () => {
    const r = spawnSync(
      process.execPath,
      [join(EVALS, "drive.mjs"), "--pilot", "--prompt", "terse", "--dry-run"],
      { cwd: EVALS, encoding: "utf8" }
    )
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /--prompt is one of explicit, minimal/)
  })

  it("--rescore re-scores the stored solution under its variant, beside the originals", () => {
    const run = join(out, "node-tool", "thin", "001")
    const before = {
      score: readFileSync(join(run, "score.json"), "utf8"),
      summary: readFileSync(join(out, "summary.json"), "utf8"),
    }
    const r = spawnSync(
      process.execPath,
      [
        join(EVALS, "drive.mjs"),
        "--aggregate",
        out,
        "--rescore",
        "--jobs",
        "1",
      ],
      { cwd: EVALS, encoding: "utf8", timeout: 600_000 }
    )
    assert.equal(r.status, 0, r.stderr.slice(-2000))
    assert.match(r.stdout, /rescore: 1 runs re-scored/)
    assert.match(
      r.stdout,
      /not applicable under --prompt minimal, node-tool .*refuses_amount_past_nat64 1\/1/
    )
    assert.equal(readFileSync(join(run, "score.json"), "utf8"), before.score)
    assert.equal(
      readFileSync(join(out, "summary.json"), "utf8"),
      before.summary
    )
    const rescored = JSON.parse(
      readFileSync(join(run, "score.rescored.json"), "utf8")
    )
    assert.equal(rescored.prompt, "minimal")
    assert.equal(rescored.agent.exit, "normal")
    assert.deepEqual(rescored.scoredAtRun, {
      safe: true,
      requirementsMet: 1,
    })
    const summary = JSON.parse(
      readFileSync(join(out, "summary.rescored.json"), "utf8")
    )
    assert.deepEqual(summary.prompt, { minimal: 1 })
  })
})
