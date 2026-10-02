#!/usr/bin/env node
// Run driver for the agent matrix. NOT EXECUTED by the harness author: the
// matrix needs a budget decision. `--dry-run` prints the plan.
//
//   node evals/drive.mjs --n 20 --model <model> [--task t]... [--condition c]...
//        [--jobs 4] [--timeout-min 30] [--max-turns 60] [--seed 1]
//        [--prompt explicit|minimal] [--effort <level>] [--oauth-token-file <f>]
//        [--mode sandboxed|tsc-only] [--sandbox-allow <dir>]... [--agent-cmd <tpl>]
//        [--retries 2] [--out <dir>] [--resume <dir>] [--pilot] [--margin 0.1] [--dry-run]
//   node evals/drive.mjs --aggregate <results dir> [--rescan] [--rescore] [--pilot] [--margin 0.1]
//
// --rescan re-audits each stored transcript with the current leak scanner;
// --rescore re-scores each stored solution with the current hidden tests and
// task.json (no agent is launched), under the prompt variant its run used.
// Either writes summary.<rescanned|rescored>.json (and pilot.…json) beside
// the originals, which are never changed; --rescore also writes each run's
// score.rescored.json beside its score.json.
//
// --prompt picks the prompt variant (harness/assemble.mjs PROMPT_VARIANTS):
// `explicit` (default) states the safety rules; `minimal` gives only the
// product and its public contract. Every record carries it; variants are
// never pooled.
//
// Phase 1, agents. Runs are ordered round-robin — every round has one run of
// every task × condition cell, in a seeded shuffle — so conditions interleave
// in time instead of running in cell blocks. For each run it
//   1. builds a private run directory under a fresh 0700 batch directory in
//      the OS temp dir (refused if inside the repository): work/ (the starter,
//      that condition's docs only, a clean copy of the condition's shipped
//      node_modules, git-initialised), home/ (a clean HOME and
//      CLAUDE_CONFIG_DIR, so the host's ~/.claude — settings, memory, MCP
//      servers, OAuth login — is not visible) and tmp/ (TMPDIR);
//   2. launches ONE headless agent in work/ with the rendered prompt (identical
//      across conditions but for the library line), inside the OS sandbox
//      (harness/sandbox.mjs: file contents outside the run and the toolchain
//      unreadable, nothing outside the run writable), with a wall-clock
//      timeout; the only host values passed are PATH and exactly one
//      credential (harness/auth.mjs), which is how the agent authenticates;
//   3. audits the transcript (harness/leak-scan.mjs, a second line behind the
//      sandbox): a successful tool call reaching outside the run marks the run
//      contaminated;
//   4. records the agent's exit (normal / max_turns / timeout / error /
//      no_result), turns, tokens and cost from the transcript, and copies
//      work/ (minus node_modules) to the results directory.
// A run that throws is recorded as a harness error and retried (--retries).
//
// Phase 2, scoring — only after every agent run has ended, so no agent is
// alive while hidden tests exist anywhere on disk. score.mjs works in its own
// 0700 directory. A scoring harness error is retried, then excluded and
// counted (never scored as 0).
//
// Phase 3, aggregation (harness/aggregate.mjs): per task × model × condition,
// never pooling models; primary metric the fraction of runs with zero safety
// violations (Wilson; Newcombe for differences), secondary mean requirements
// met; main result without contaminated runs, intent-to-treat with them.
// `--pilot` (5 runs per cell by default) adds variance, minutes/turns/tokens
// per run, ceiling/floor warnings and the runs needed for `--margin`.
//
// --resume <dir> continues a batch: runs with agent.json are not re-run, runs
// without score.json are scored. A run excluded as a harness error has no
// agent.json, so it is run again and scored.
//
// ASSUMED AGENT CLI (override with --agent-cmd): Claude Code headless,
//   claude -p "$(cat {prompt})" --output-format stream-json --verbose
//     --model {model} --permission-mode acceptEdits --max-turns {maxTurns}
//     --allowedTools "{allowedTools}" --disallowedTools "WebFetch,WebSearch"
//     --strict-mcp-config
// Placeholders: {prompt}, {model}, {maxTurns}, {allowedTools}, {task},
// {condition} (the last two are for stub agents in harness tests). The
// transcript must be stream-json for the audit and the exit/turn/token record.
import { spawn } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import {
  CONDITIONS,
  EVALS,
  TASKS,
  PROMPT_VARIANTS,
  conditionDocDirs,
  renderPrompt,
  taskSpec,
} from "./harness/assemble.mjs"
import {
  aggregate,
  pilotReport,
  printPilot,
  printSummary,
  round,
} from "./harness/aggregate.mjs"
import { scanTranscript, transcriptCwd } from "./harness/leak-scan.mjs"
import {
  agentEnv,
  makeBatchDir,
  prepareBareRun,
  prepareRun,
  REPO,
} from "./harness/runs.mjs"
import {
  AUTH_VARS,
  MISSING_AUTH_MESSAGE,
  redact,
  resolveAuth,
  secretsOf,
} from "./harness/auth.mjs"
import {
  cliInstallDir,
  nodeInstallDir,
  sandboxAvailable,
  sandboxPrefix,
} from "./harness/sandbox.mjs"

export const ALLOWED_TOOLS = {
  sandboxed:
    "Read,Edit,Write,Glob,Grep,Bash(npx tsc:*),Bash(npx vitest:*),Bash(node:*),Bash(ls:*),Bash(cat:*)",
  "tsc-only": "Read,Edit,Write,Glob,Grep,Bash(npx tsc:*),Bash(ls:*)",
}

export const DEFAULT_AGENT_CMD =
  'claude -p "$(cat {prompt})" --output-format stream-json --verbose --model {model} {effortFlag}' +
  "--permission-mode acceptEdits --max-turns {maxTurns} " +
  '--allowedTools "{allowedTools}" --disallowedTools "WebFetch,WebSearch" ' +
  "--strict-mcp-config"

/**
 * The preflight: one tiny call in the same isolated environment and sandbox
 * as a real run, which must succeed before any agent run starts.
 */
export const PREFLIGHT_CMD =
  "claude -p 'Reply with the single word: ok' --output-format stream-json --verbose " +
  "--model {model} {effortFlag}--max-turns 1 " +
  '--disallowedTools "WebFetch,WebSearch" --strict-mcp-config'

// The credential, resolved once (harness/auth.mjs). Kept out of `args`, which
// is written to plan.json: only its kind and source are recorded.
let AUTH

// ---------------------------------------------------------------- arguments
function parseArgs(argv) {
  const args = {
    tasks: [],
    conditions: [],
    n: 0,
    model: undefined,
    effort: undefined,
    oauthTokenFile: undefined,
    preflight: false,
    preflightCmd: PREFLIGHT_CMD,
    jobs: undefined,
    timeoutMin: 30,
    maxTurns: 60,
    seed: 1,
    mode: undefined,
    prompt: "explicit",
    sandboxAllow: [],
    agentCmd: DEFAULT_AGENT_CMD,
    customCmd: false,
    retries: 2,
    rateLimitRetries: 4,
    rateLimitBackoffMin: 5,
    rateLimitMaxWaitMin: 300,
    out: undefined,
    resume: undefined,
    pilot: false,
    margin: 0.1,
    dryRun: false,
    aggregate: undefined,
    estMinutes: 12,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const value = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`${flag} needs a value`)
      return v
    }
    switch (flag) {
      case "--task":
        args.tasks.push(value())
        break
      case "--condition":
        args.conditions.push(value())
        break
      case "--n":
        args.n = Number(value())
        break
      case "--model":
        args.model = value()
        break
      case "--effort":
        args.effort = value()
        break
      case "--oauth-token-file":
        args.oauthTokenFile = resolve(value())
        break
      case "--preflight":
        args.preflight = true
        break
      case "--preflight-cmd":
        // For harness tests: a stub in place of the real CLI call.
        args.preflightCmd = value()
        break
      case "--jobs":
        args.jobs = Number(value())
        break
      case "--rate-limit-retries":
        args.rateLimitRetries = Number(value())
        break
      case "--rate-limit-backoff-min":
        args.rateLimitBackoffMin = Number(value())
        break
      case "--rate-limit-max-wait-min":
        args.rateLimitMaxWaitMin = Number(value())
        break
      case "--timeout-min":
        args.timeoutMin = Number(value())
        break
      case "--max-turns":
        args.maxTurns = Number(value())
        break
      case "--seed":
        args.seed = Number(value())
        break
      case "--mode":
        args.mode = value()
        break
      case "--prompt":
        args.prompt = value()
        args.promptGiven = true
        break
      case "--sandbox-allow":
        args.sandboxAllow.push(value())
        break
      case "--agent-cmd":
        args.agentCmd = value()
        args.customCmd = true
        break
      case "--retries":
        args.retries = Number(value())
        break
      case "--out":
        args.out = value()
        break
      case "--resume":
        args.resume = value()
        break
      case "--pilot":
        args.pilot = true
        break
      case "--margin":
        args.margin = Number(value())
        break
      case "--est-minutes":
        args.estMinutes = Number(value())
        break
      case "--dry-run":
        args.dryRun = true
        break
      case "--aggregate":
        args.aggregate = value()
        break
      case "--rescan":
        args.rescan = true
        break
      case "--rescore":
        args.rescore = true
        break
      default:
        throw new Error(`unknown argument ${flag}`)
    }
  }
  if (args.tasks.length === 0) args.tasks = [...TASKS]
  if (args.conditions.length === 0) args.conditions = [...CONDITIONS]
  for (const t of args.tasks) taskSpec(t)
  for (const c of args.conditions) {
    if (!CONDITIONS.includes(c)) throw new Error(`unknown condition ${c}`)
  }
  if (!PROMPT_VARIANTS.includes(args.prompt)) {
    throw new Error(`--prompt is one of ${PROMPT_VARIANTS.join(", ")}`)
  }
  if (args.pilot && args.n === 0) args.n = 5
  args.mode ??= sandboxAvailable() ? "sandboxed" : undefined
  if (args.effort !== undefined && !/^[a-z]+$/.test(args.effort)) {
    throw new Error(`--effort takes a level name such as low, medium or high`)
  }
  if (!args.aggregate && !args.resume && !args.preflight) {
    if (!(args.n >= 1))
      throw new Error("--n <runs per cell> is required (or --pilot)")
    if (!args.mode) {
      throw new Error(
        "no OS sandbox is available here: agents cannot be allowed to run node/vitest. " +
          "Pass --mode tsc-only for the documented fallback (type-check feedback only)."
      )
    }
    if (!["sandboxed", "tsc-only"].includes(args.mode))
      throw new Error("--mode is sandboxed or tsc-only")
    if (args.mode === "sandboxed" && !sandboxAvailable()) {
      throw new Error(
        "--mode sandboxed needs sandbox-exec (macOS); use --mode tsc-only"
      )
    }
    if (!args.dryRun && !args.model) {
      throw new Error(
        "--model is required for a real run (an owner decision; see README)"
      )
    }
  }
  resolveCredential(args)
  if (
    (args.preflight || (!args.aggregate && !args.dryRun)) &&
    !args.customCmd &&
    !AUTH
  ) {
    throw new Error(MISSING_AUTH_MESSAGE)
  }
  if (
    (args.preflight || (!args.aggregate && !args.resume && !args.dryRun)) &&
    !args.model
  ) {
    throw new Error("--model is required (an owner decision; see README)")
  }
  // A subscription is rate-limited per account: fewer agents at a time.
  args.jobs ??= args.auth === "oauth" ? 2 : 4
  return args
}

/**
 * Resolves the credential once — `--oauth-token-file`, then
 * CLAUDE_CODE_OAUTH_TOKEN, then ANTHROPIC_API_KEY — and records its kind and
 * source (never its value) in `args`. A custom --agent-cmd (a stub agent in
 * harness tests) may run without one.
 */
function resolveCredential(args) {
  AUTH = resolveAuth(process.env, { tokenFile: args.oauthTokenFile })
  args.auth = AUTH?.kind ?? "none"
  args.authSource = AUTH
    ? AUTH.source === "file"
      ? "--oauth-token-file"
      : AUTH.name
    : "none"
}

// ---------------------------------------------------------------- planning
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Round-robin over cells, each round in a seeded shuffle. */
export function plan({ tasks, conditions, n, seed }) {
  const random = rng(seed)
  const cells = tasks.flatMap((task) =>
    conditions.map((condition) => ({ task, condition }))
  )
  const runs = []
  for (let i = 1; i <= n; i += 1) {
    const round = [...cells]
    for (let j = round.length - 1; j > 0; j -= 1) {
      const k = Math.floor(random() * (j + 1))
      ;[round[j], round[k]] = [round[k], round[j]]
    }
    for (const cell of round) runs.push({ ...cell, i })
  }
  return runs
}

const runDirOf = (outDir, run) =>
  join(outDir, run.task, run.condition, String(run.i).padStart(3, "0"))

function agentCommand(
  args,
  { promptFile, runRoot },
  run,
  template = args.agentCmd
) {
  const shq = (s) => `'${String(s).replace(/'/g, "'\\''")}'`
  const inner = template
    .replaceAll("{prompt}", shq(promptFile))
    .replaceAll("{model}", shq(args.model ?? "<model: owner decision>"))
    .replaceAll("{maxTurns}", String(args.maxTurns))
    .replaceAll(
      "{effortFlag}",
      args.effort ? `--effort ${shq(args.effort)} ` : ""
    )
    .replaceAll("{allowedTools}", ALLOWED_TOOLS[args.mode])
    .replaceAll("{task}", run?.task ?? "<task>")
    .replaceAll("{condition}", run?.condition ?? "<condition>")
  if (!sandboxAvailable())
    return { argv: ["sh", "-c", inner], sandboxed: false }
  const readOnly = [
    nodeInstallDir(),
    cliInstallDir("claude"),
    ...args.sandboxAllow,
  ]
  const prefix = runRoot
    ? sandboxPrefix({ runRoot, readOnly })
    : ["sandbox-exec", "-f", "<run>/sandbox.sb"]
  return { argv: [...prefix, "sh", "-c", inner], sandboxed: true }
}

// ---------------------------------------------------------------- phase 1
function spawnAgent(argv, { cwd, env, timeoutMs, logBase }) {
  return new Promise((resolvePromise) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let out = ""
    let err = ""
    let timedOut = false
    child.stdout.on("data", (d) => (out += d))
    child.stderr.on("data", (d) => (err += d))
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGKILL")
    }, timeoutMs)
    const onAbort = () => child.kill("SIGKILL")
    batchAbort.signal.addEventListener("abort", onAbort, { once: true })
    child.on("close", (code, signal) => {
      clearTimeout(timer)
      batchAbort.signal.removeEventListener("abort", onAbort)
      writeFileSync(`${logBase}.stdout`, redact(out))
      writeFileSync(`${logBase}.stderr`, redact(err))
      resolvePromise({ code, signal, out, err, timedOut })
    })
  })
}

// A usage or rate limit, as the CLI reports one. ASSUMED (from the CLI's
// documented stream-json shape and its observed error texts, not verified
// against 2.1.285): a subscription limit ends the run with an error `result`
// whose text reads like "Claude AI usage limit reached|<reset epoch>" or
// "... limit reached ... resets ...", and an API limit as
// "API Error: 429 ... rate_limit_error" or "overloaded_error". Only error
// results, top-level `error` fields and the CLI's stderr are inspected — the
// agent's own prose in this task talks about HTTP 429 all the time — and a
// successful result is never a rate limit.
// Sign-in failures, measured on CLI 2.1.285: with an isolated config
// directory and no credential a run returns subtype "success", is_error true,
// result "Not logged in · Please run /login". Also: api_error_status 401/403.
const SIGN_IN =
  /not logged in|\/login\b|invalid api key|oauth token (has )?(expired|revoked)|authentication (failed|error)|unauthori[sz]ed/i
const SIGN_IN_STATUS = new Set([401, 403])
const LIMIT_STATUS = new Set([429, 529])

const RATE_LIMIT =
  /usage limit|limit reached|rate[_ ]?limit|too many requests|\b429\b|overloaded(_error)?|\b529\b/i

/**
 * Exit reason, turns, tokens and cost from the stream-json `result` message.
 * `rateLimitedUntil` is the reset time (ms) when the limit message names one.
 */
export function agentOutcome(stdout, { timedOut, stderr = "" }) {
  let result
  const errorTexts = []
  for (const line of stdout.split("\n")) {
    const l = line.trim()
    if (!l.startsWith("{")) continue
    try {
      const msg = JSON.parse(l)
      if (msg.type === "result") result = msg
      if (msg.type === "error" || msg.error !== undefined) {
        errorTexts.push(JSON.stringify(msg.error ?? msg))
      }
    } catch {
      // not JSON
    }
  }
  const failed = result
    ? result.is_error === true || result.subtype !== "success"
    : true
  if (result && failed && typeof result.result === "string") {
    errorTexts.push(result.result)
  }
  if (failed) errorTexts.push(stderr)
  const status = failed ? result?.api_error_status : undefined
  const signInText = errorTexts.find((t) => SIGN_IN.test(t))
  const signIn =
    !timedOut && (SIGN_IN_STATUS.has(status) || signInText !== undefined)
  const limitText =
    errorTexts.find((t) => RATE_LIMIT.test(t)) ??
    (LIMIT_STATUS.has(status) ? `api_error_status ${status}` : undefined)
  const epoch = limitText && /\|(\d{10})\b/.exec(limitText)
  const exit = signIn
    ? "sign_in_error"
    : !timedOut && limitText
      ? "rate_limited"
      : timedOut
        ? "timeout"
        : !result
          ? "no_result"
          : result.subtype === "success" && result.is_error !== true
            ? "normal"
            : result.subtype === "error_max_turns"
              ? "max_turns"
              : "error"
  const usage = result?.usage ?? {}
  return {
    exit,
    turns: result?.num_turns ?? null,
    tokens: {
      input: usage.input_tokens ?? null,
      output: usage.output_tokens ?? null,
      cacheRead: usage.cache_read_input_tokens ?? null,
      cacheCreation: usage.cache_creation_input_tokens ?? null,
    },
    costUsd: result?.total_cost_usd ?? null,
    resultText:
      typeof result?.result === "string" ? result.result.slice(0, 500) : null,
    apiErrorStatus: result?.api_error_status ?? null,
    ...(exit === "sign_in_error"
      ? {
          signInMessage: String(
            signInText ?? `api_error_status ${status}`
          ).slice(0, 300),
        }
      : {}),
    ...(exit === "rate_limited"
      ? {
          rateLimitedUntil: epoch ? Number(epoch[1]) * 1000 : null,
          rateLimitMessage: String(limitText).slice(0, 300),
        }
      : {}),
  }
}

/** The CLI could not sign in: the whole batch stops at once. */
export class SignInError extends Error {}

/** Stops every agent run of the batch (a sign-in failure). */
const batchAbort = new AbortController()

/** A run the account's usage or rate limit stopped: a harness error, not a result. */
export class RateLimited extends Error {
  constructor(message, until) {
    super(message)
    this.until = until
  }
}

/** Replaces credential values in every text file under `dir`. */
function redactTree(dir, secrets) {
  if (secrets.length === 0) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) redactTree(p, secrets)
    else if (entry.isFile()) {
      const text = readFileSync(p, "latin1")
      if (secrets.some((s) => text.includes(s))) {
        writeFileSync(p, redact(text, secrets), "latin1")
      }
    }
  }
}

async function agentRun(args, batchDir, outDir, run) {
  const dir = runDirOf(outDir, run)
  mkdirSync(dir, { recursive: true })
  const prepared = prepareRun({
    batchDir,
    ...run,
    mode: args.mode,
    prompt: args.prompt,
  })
  const { argv, sandboxed } = agentCommand(args, prepared, run)
  const started = Date.now()
  const auth = AUTH
  const agent = await spawnAgent(argv, {
    cwd: prepared.work,
    env: agentEnv(prepared, auth),
    timeoutMs: args.timeoutMin * 60_000,
    logBase: join(dir, "agent"),
  })
  const minutes = (Date.now() - started) / 60_000
  const outcome = agentOutcome(agent.out, { ...agent, stderr: agent.err })
  if (batchAbort.signal.aborted) {
    // Killed because another run could not sign in: not a result.
    rmSync(prepared.runRoot, { recursive: true, force: true })
    throw new SignInError("the batch was stopped")
  }
  if (outcome.exit === "sign_in_error") {
    rmSync(prepared.runRoot, { recursive: true, force: true })
    throw new SignInError(redact(outcome.signInMessage ?? "not signed in"))
  }
  if (outcome.exit === "rate_limited") {
    // Keep the attempt's logs for the record; the run itself is retried.
    for (const ext of ["stdout", "stderr"]) {
      cpSync(
        join(dir, `agent.${ext}`),
        join(dir, `rate-limited-${Date.now()}.${ext}`)
      )
    }
    rmSync(prepared.runRoot, { recursive: true, force: true })
    throw new RateLimited(
      redact(outcome.rateLimitMessage ?? "rate limited"),
      outcome.rateLimitedUntil
    )
  }
  const audit = scanTranscript(agent.out, { runDir: prepared.work })
  cpSync(prepared.work, join(dir, "solution"), {
    recursive: true,
    filter: (src) =>
      !src.startsWith(join(prepared.work, "node_modules")) &&
      !src.endsWith("/.git"),
  })
  redactTree(join(dir, "solution"), secretsOf())
  const meta = {
    task: run.task,
    condition: run.condition,
    run: run.i,
    model: args.model,
    effort: args.effort ?? "default",
    prompt: args.prompt,
    auth: auth?.kind ?? "none",
    seed: args.seed,
    mode: args.mode,
    sandboxed,
    agent: {
      ...outcome,
      minutes: round(minutes),
      code: agent.code,
      signal: agent.signal,
    },
    contaminated: audit.contaminated,
    audit: {
      auditable: audit.auditable,
      toolCalls: audit.toolCalls,
      attempts: audit.attempts,
      violations: audit.violations.slice(0, 20),
    },
  }
  writeFileSync(
    join(dir, "agent.json"),
    redact(JSON.stringify(meta, null, 2)) + "\n"
  )
  rmSync(prepared.runRoot, { recursive: true, force: true })
  return meta
}

async function pool(items, jobs, fn) {
  let next = 0
  const worker = async () => {
    while (next < items.length && !batchAbort.signal.aborted) {
      await fn(items[next++])
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker))
}

// ---------------------------------------------------------------- phase 2
function scoreOnce(run, dir, prompt = "explicit") {
  return new Promise((resolvePromise) => {
    const child = spawn(
      process.execPath,
      [
        join(EVALS, "score.mjs"),
        "--task",
        run.task,
        "--condition",
        run.condition,
        "--solution",
        join(dir, "solution"),
        "--prompt",
        prompt,
      ],
      { cwd: EVALS, stdio: ["ignore", "pipe", "pipe"] }
    )
    let out = ""
    let err = ""
    child.stdout.on("data", (d) => (out += d))
    child.stderr.on("data", (d) => (err += d))
    child.on("close", (code) => resolvePromise({ code, out, err }))
  })
}

async function scoreRun(args, outDir, run) {
  const dir = runDirOf(outDir, run)
  const meta = JSON.parse(readFileSync(join(dir, "agent.json"), "utf8"))
  let score
  let lastError = ""
  for (let attempt = 0; attempt <= args.retries && !score; attempt += 1) {
    const r = await scoreOnce(run, dir, meta.prompt ?? args.prompt)
    if (r.code === 0) score = JSON.parse(r.out)
    else lastError = redact(`score.mjs exit ${r.code}: ${r.err.slice(-2000)}`)
  }
  const record = score
    ? { ...score, ...meta }
    : { ...meta, harnessError: lastError, harnessKind: "scoring" }
  delete record.details
  writeFileSync(
    join(dir, "score.json"),
    redact(JSON.stringify(record, null, 2)) + "\n"
  )
  return record
}

function loadRecords(dir) {
  const records = []
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name)
      if (entry.isDirectory() && entry.name !== "solution") walk(p)
      else if (entry.name === "score.json")
        records.push({ ...JSON.parse(readFileSync(p, "utf8")), _dir: d })
    }
  }
  walk(dir)
  return records
}

/**
 * Re-audits every run from its stored transcript with the current scanner
 * (the run directory it names in its init message), in memory: the records
 * on disk are not changed.
 */
function rescan(records) {
  let changed = 0
  const out = records.map((r) => {
    const transcript = r._dir && join(r._dir, "agent.stdout")
    if (!transcript || !existsSync(transcript) || r.harnessError) return r
    const text = readFileSync(transcript, "utf8")
    const runDir = transcriptCwd(text)
    if (!runDir) return r
    const audit = scanTranscript(text, { runDir })
    if (audit.contaminated !== Boolean(r.contaminated)) changed += 1
    return {
      ...r,
      contaminatedAtRun: Boolean(r.contaminated),
      contaminated: audit.contaminated,
      audit: {
        auditable: audit.auditable,
        toolCalls: audit.toolCalls,
        attempts: audit.attempts,
        violations: audit.violations.slice(0, 20),
      },
    }
  })
  process.stdout.write(
    `rescan: ${out.length} runs re-audited from their transcripts; contamination changed in ${changed}; ` +
      `now ${out.filter((r) => r.contaminated && !r.harnessError).length} contaminated ` +
      `(was ${records.filter((r) => r.contaminated && !r.harnessError).length})\n\n`
  )
  return out
}

/**
 * Re-scores every stored solution with the current hidden tests and
 * task.json, under the prompt variant its run used; the run's agent record is
 * kept. Writes score.rescored.json beside each score.json (never changed).
 */
async function rescore(args, records) {
  let changed = 0
  let errors = 0
  const out = [...records]
  await pool(
    records.map((r, i) => [r, i]),
    args.jobs,
    async ([r, i]) => {
      if (r.harnessError || !r._dir || !existsSync(join(r._dir, "solution")))
        return
      const agentFile = join(r._dir, "agent.json")
      const meta = existsSync(agentFile)
        ? JSON.parse(readFileSync(agentFile, "utf8"))
        : {}
      let score
      let lastError = ""
      for (let attempt = 0; attempt <= args.retries && !score; attempt += 1) {
        const s = await scoreOnce(r, r._dir, r.prompt ?? "explicit")
        if (s.code === 0) score = JSON.parse(s.out)
        else
          lastError = redact(`score.mjs exit ${s.code}: ${s.err.slice(-2000)}`)
      }
      if (!score) {
        errors += 1
        process.stderr.write(`${r._dir}: rescoring failed: ${lastError}\n`)
        out[i] = { ...r, harnessError: lastError, harnessKind: "rescoring" }
        return
      }
      delete score.details
      const record = {
        ...score,
        ...meta,
        // agent.json never carries a score; keep the run's own variant and
        // a re-audit (--rescan) if one was made.
        prompt: r.prompt ?? "explicit",
        contaminated: r.contaminated,
        ...(r.contaminatedAtRun !== undefined
          ? { contaminatedAtRun: r.contaminatedAtRun, audit: r.audit }
          : {}),
        scoredAtRun: { safe: r.safe, requirementsMet: r.requirementsMet },
      }
      if (
        record.safe !== r.safe ||
        record.requirementsMet !== r.requirementsMet
      )
        changed += 1
      writeFileSync(
        join(r._dir, "score.rescored.json"),
        redact(JSON.stringify(record, null, 2)) + "\n"
      )
      out[i] = { ...record, _dir: r._dir }
    }
  )
  process.stdout.write(
    `rescore: ${records.length} runs re-scored from their stored solutions with the current hidden tests; ` +
      `safe or requirements-met changed in ${changed}; rescoring errors ${errors}\n\n`
  )
  return out
}

async function report(args, records, outDir) {
  if (args.rescan) records = rescan(records)
  if (args.rescore) records = await rescore(args, records)
  const suffix =
    (args.rescan ? ".rescanned" : "") + (args.rescore ? ".rescored" : "")
  records = records.map(({ _dir, ...r }) => r)
  const summary = aggregate(records)
  writeFileSync(
    join(outDir, `summary${suffix}.json`),
    redact(JSON.stringify(summary, null, 2)) + "\n"
  )
  printSummary(summary)
  if (args.pilot) {
    const pilot = pilotReport(records, { margin: args.margin })
    writeFileSync(
      join(outDir, `pilot${suffix}.json`),
      redact(JSON.stringify(pilot, null, 2)) + "\n"
    )
    process.stdout.write("\n")
    printPilot(pilot)
  }
}

function describeAuth(args) {
  if (args.auth === "oauth") {
    return (
      `Claude subscription token from ${args.authSource}` +
      (process.env[AUTH_VARS.api_key]
        ? ` (${AUTH_VARS.api_key} is set but not passed)`
        : "")
    )
  }
  if (args.auth === "api_key") return `${AUTH_VARS.api_key} (API billing)`
  return "none (custom agent command)"
}

/**
 * One tiny call in an isolated run directory, environment and sandbox exactly
 * like an agent run's. Succeeds when the CLI returns a successful result that
 * is not an error; otherwise prints the CLI's result text and stops.
 */
export async function preflight(args) {
  const batchDir = makeBatchDir()
  try {
    const prepared = prepareBareRun({ batchDir })
    const { argv } = agentCommand(
      args,
      { promptFile: "", runRoot: prepared.runRoot },
      undefined,
      args.preflightCmd
    )
    const logBase = join(prepared.runRoot, "preflight")
    const r = await spawnAgent(argv, {
      cwd: prepared.work,
      env: agentEnv(prepared, AUTH),
      timeoutMs: 5 * 60_000,
      logBase,
    })
    const outcome = agentOutcome(r.out, { ...r, stderr: r.err })
    if (outcome.exit !== "normal") {
      throw new Error(
        `preflight failed (${outcome.exit}): the CLI said: ` +
          redact(outcome.resultText ?? r.err.slice(-500) ?? "(nothing)") +
          (outcome.exit === "sign_in_error"
            ? " — check --oauth-token-file / CLAUDE_CODE_OAUTH_TOKEN (`claude setup-token`) or ANTHROPIC_API_KEY"
            : "")
      )
    }
    process.stdout.write(
      `preflight ok (${describeAuth(args)}; model ${args.model}; effort ${args.effort ?? "default"})\n`
    )
  } finally {
    rmSync(batchDir, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------- main
async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.preflight && !args.dryRun) {
    await preflight(args)
    return
  }
  if (args.aggregate) {
    await report(
      args,
      loadRecords(resolve(args.aggregate)),
      resolve(args.aggregate)
    )
    return
  }
  let outDir
  let runs
  if (args.resume) {
    outDir = resolve(args.resume)
    const saved = JSON.parse(readFileSync(join(outDir, "plan.json"), "utf8"))
    // A batch keeps its prompt variant (batches from before --prompt existed
    // were explicit); asking to resume it with another one is refused.
    const savedPrompt = saved.args.prompt ?? "explicit"
    if (args.promptGiven && args.prompt !== savedPrompt) {
      throw new Error(
        `${outDir} is a --prompt ${savedPrompt} batch; it cannot be resumed with --prompt ${args.prompt}`
      )
    }
    Object.assign(args, {
      ...saved.args,
      prompt: savedPrompt,
      resume: args.resume,
      dryRun: args.dryRun,
      pilot: args.pilot || saved.args.pilot,
      oauthTokenFile: args.oauthTokenFile ?? saved.args.oauthTokenFile,
    })
    resolveCredential(args)
    if (!args.customCmd && !AUTH) throw new Error(MISSING_AUTH_MESSAGE)
    runs = saved.runs
  } else {
    runs = plan(args)
    outDir = resolve(
      args.out ??
        join(EVALS, "runs", new Date().toISOString().replace(/[:.]/g, "-"))
    )
  }
  const cells = args.tasks.length * args.conditions.length

  if (args.dryRun) {
    const example = agentCommand(args, { promptFile: "<run>/prompt.md" })
    process.stdout.write(
      [
        `drive.mjs --dry-run${args.pilot ? " --pilot" : ""}: nothing will be launched.`,
        `cells: ${cells} (tasks: ${args.tasks.join(", ")}; conditions: ${args.conditions.join(", ")})`,
        `runs: ${runs.length} (${args.n} per cell), round-robin in a shuffle seeded ${args.seed}; ${args.jobs} at a time; timeout ${args.timeoutMin} min; max ${args.maxTurns} turns`,
        `model: ${args.model ?? "<unset: an owner decision; required for a real run>"} (every record carries it; models are never pooled)`,
        `mode: ${args.mode} (${args.mode === "sandboxed" ? "agents may run tsc, vitest and node, inside the OS sandbox" : "type-check feedback only"})`,
        `sandbox: ${sandboxAvailable() ? `sandbox-exec; readable toolchain: ${[nodeInstallDir(), cliInstallDir("claude") ?? "<claude CLI not on PATH here>", ...args.sandboxAllow].join(", ")}` : "none available"}`,
        `run dirs: a fresh 0700 batch dir under the OS temp dir (refused if inside ${REPO}); per run work/ home/ tmp/`,
        `auth: ${args.auth === "none" ? `none found (--oauth-token-file, ${AUTH_VARS.oauth} — see \`claude setup-token\` — or ${AUTH_VARS.api_key}): a real run will refuse to start` : describeAuth(args)}; passed to the agent as exactly one variable; the value is never printed or recorded`,
        `effort: ${args.effort ?? "the CLI default"} (recorded per run; never pooled across effort levels)`,
        `prompt: ${args.prompt} (${args.prompt === "explicit" ? "states the safety rules the hidden tests check" : "product and public contract only; no safety rules"}; recorded per run; never pooled across prompt variants)`,
        `preflight: before any run, one tiny call ("Reply with the single word: ok", max 1 turn) in the same isolated environment and sandbox must succeed; also runnable alone with --preflight`,
        `agent environment: PATH, HOME=<run>/home, CLAUDE_CONFIG_DIR=<run>/home/.claude, TMPDIR=<run>/tmp, and exactly one of ${AUTH_VARS.oauth} / ${AUTH_VARS.api_key} (the host's ~/.claude login is not visible)`,
        "rate limits: a usage/rate-limit exit is a harness error, retried with backoff (up to --rate-limit-retries), then excluded and counted — never scored as a failed solution",
        "leak audit: stream-json transcript scanned; a successful outside read or network use marks the run contaminated (excluded from main, kept in intent-to-treat)",
        "scoring: after every agent run has ended, in score.mjs's own 0700 directory; harness errors retried, then excluded and counted",
        `results: ${outDir}/<task>/<condition>/<nnn>/{agent.stdout,agent.stderr,agent.json,solution/,score.json}, plan.json, summary.json${args.pilot ? ", pilot.json" : ""}`,
        `estimated agent time: ${runs.length} runs × ~${args.estMinutes} min = ${round((runs.length * args.estMinutes) / 60)} agent-hours` +
          ` (~${round((runs.length * args.estMinutes) / 60 / args.jobs)} h wall-clock at ${args.jobs} parallel), plus ~2 min scoring per run`,
        `agent command (cwd = <run>/work):\n  ${example.argv.join(" ")}`,
        "",
        "per-cell plan:",
        ...args.tasks.flatMap((task) =>
          args.conditions.map((condition) => {
            const docs =
              conditionDocDirs(condition)
                .flatMap((d) => readdirSync(d))
                .join(", ") || "(none)"
            return `  ${task} × ${condition}: ${args.n} runs; docs/: ${docs}; ${args.prompt} prompt ${renderPrompt(task, condition, args.mode, args.prompt).length} chars`
          })
        ),
        "",
        "first runs, in order:",
        ...runs
          .slice(0, Math.min(runs.length, 10))
          .map((r) => `  ${r.task}/${r.condition}#${r.i}`),
        runs.length > 10 ? `  ... ${runs.length - 10} more` : "",
        args.pilot
          ? `\nafter the runs: pilot report (variance, minutes/turns/tokens, ceiling/floor warnings, runs per cell for margin ${args.margin})`
          : "",
      ].join("\n") + "\n"
    )
    return
  }

  process.stdout.write(
    `auth: ${describeAuth(args)}; effort ${args.effort ?? "default"}; prompt ${args.prompt}; ${args.jobs} agents at a time\n`
  )
  mkdirSync(outDir, { recursive: true })
  if (!args.resume) {
    writeFileSync(
      join(outDir, "plan.json"),
      redact(JSON.stringify({ args, runs }, null, 2)) + "\n"
    )
  }

  // Preflight: one tiny call must succeed before any agent run starts.
  if (!args.customCmd || args.preflightCmd !== PREFLIGHT_CMD)
    await preflight(args)

  // Phase 1: agents.
  let signInFailure
  const pending = runs.filter(
    (run) => !existsSync(join(runDirOf(outDir, run), "agent.json"))
  )
  const batchDir = makeBatchDir()
  try {
    await pool(pending, args.jobs, async (run) => {
      const label = `${run.task}/${run.condition}#${run.i}`
      const fail = (kind, message) => {
        const dir = runDirOf(outDir, run)
        mkdirSync(dir, { recursive: true })
        writeFileSync(
          join(dir, "score.json"),
          redact(
            JSON.stringify(
              {
                task: run.task,
                condition: run.condition,
                run: run.i,
                model: args.model,
                effort: args.effort ?? "default",
                prompt: args.prompt,
                auth: args.auth,
                seed: args.seed,
                mode: args.mode,
                harnessError: message,
                harnessKind: kind,
              },
              null,
              2
            )
          ) + "\n"
        )
      }
      // A pending run with a score.json is a harness error recorded by an
      // earlier attempt (`fail` above), which --resume runs again: drop that
      // record so the new attempt is scored like any other run.
      rmSync(join(runDirOf(outDir, run), "score.json"), { force: true })
      let errors = 0
      let limits = 0
      for (;;) {
        try {
          const meta = await agentRun(args, batchDir, outDir, run)
          process.stdout.write(
            `${label}: agent ${meta.agent.exit}` +
              `${meta.contaminated ? " CONTAMINATED" : ""} (${meta.agent.minutes} min)\n`
          )
          return
        } catch (error) {
          if (error instanceof SignInError) {
            if (!batchAbort.signal.aborted) {
              signInFailure = `${label}: ${error.message}`
              batchAbort.abort()
            }
            return
          }
          if (error instanceof RateLimited) {
            limits += 1
            if (limits > args.rateLimitRetries) {
              process.stderr.write(
                `${label}: still rate limited; excluded as a harness error\n`
              )
              fail("rate_limited", error.message)
              return
            }
            const backoff =
              args.rateLimitBackoffMin * 60_000 * 2 ** (limits - 1)
            const untilReset = error.until
              ? error.until - Date.now() + 60_000
              : 0
            const wait = Math.min(
              Math.max(backoff, untilReset),
              args.rateLimitMaxWaitMin * 60_000
            )
            process.stderr.write(
              `${label}: rate limited (${error.message.slice(0, 120)}); retry ${limits}/${args.rateLimitRetries} in ${round(wait / 60_000)} min\n`
            )
            await new Promise((r) => setTimeout(r, wait))
            continue
          }
          errors += 1
          const message = redact(String(error?.stack ?? error))
          process.stderr.write(
            `${label}: harness error (attempt ${errors}): ${redact(error?.message ?? error)}\n`
          )
          if (errors > args.retries) {
            fail("harness", message)
            return
          }
        }
      }
    })
  } finally {
    rmSync(batchDir, { recursive: true, force: true })
  }

  if (signInFailure) {
    throw new Error(
      `the CLI could not sign in, so the batch was stopped at once (${signInFailure}). ` +
        "Check --oauth-token-file / CLAUDE_CODE_OAUTH_TOKEN (`claude setup-token`) or " +
        `ANTHROPIC_API_KEY, then continue with --resume ${outDir}`
    )
  }

  // Phase 2: scoring, only now that no agent is running.
  const toScore = runs.filter(
    (run) =>
      existsSync(join(runDirOf(outDir, run), "agent.json")) &&
      !existsSync(join(runDirOf(outDir, run), "score.json"))
  )
  await pool(toScore, args.jobs, async (run) => {
    const record = await scoreRun(args, outDir, run)
    process.stdout.write(
      `${run.task}/${run.condition}#${run.i}: ` +
        (record.harnessError
          ? "SCORING HARNESS ERROR (excluded)"
          : `safe ${record.safe}, met ${record.requirementsMet}`) +
        "\n"
    )
  })

  // Phase 3: aggregation.
  await report(args, loadRecords(outDir), outDir)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`drive.mjs: ${error?.stack ?? error}\n`)
    process.exit(2)
  })
}
