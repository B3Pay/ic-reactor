// Preparing one agent run's private directory, shared by the driver and the
// sandbox test so the test exercises exactly what the driver builds.
//
//   <batch>/<task>--<condition>--<nnn>/
//     work/   the starter (task + condition layers + docs) with a copy of the
//             condition's shipped node_modules (.ship/<base>/node_modules),
//             git-initialised; the agent's cwd
//     home/   a clean HOME; CLAUDE_CONFIG_DIR is home/.claude
//     tmp/    the agent's TMPDIR
//
// The batch directory lives under the OS temp dir, never inside the
// repository, and is created 0700.
import { spawnSync } from "node:child_process"
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import {
  EVALS,
  assembleStarter,
  baseCondition,
  renderPrompt,
} from "./assemble.mjs"

export const REPO = realpathSync(join(EVALS, ".."))

const insideRepo = (path) => {
  const rel = relative(REPO, realpathSync(path))
  return !rel.startsWith("..") && !rel.startsWith("/")
}

/** A fresh 0700 batch directory under the OS temp dir. */
export function makeBatchDir() {
  const dir = mkdtempSync(join(tmpdir(), "ic-reactor-eval-batch-"))
  chmodSync(dir, 0o700)
  if (insideRepo(dir)) {
    rmSync(dir, { recursive: true, force: true })
    throw new Error(
      `batch directory ${dir} is inside the repository; set TMPDIR elsewhere`
    )
  }
  return realpathSync(dir)
}

export function shippedNodeModules(condition) {
  const dir = join(EVALS, ".ship", baseCondition(condition), "node_modules")
  if (!existsSync(dir))
    throw new Error(`missing ${dir}: run \`node setup.mjs\``)
  return dir
}

/**
 * Builds one run's directory tree. `mode` is "sandboxed" (the public test
 * scaffold ships, and the prompt says code can be run) or "tsc-only".
 * `prompt` is the prompt variant (assemble.mjs PROMPT_VARIANTS).
 */
export function prepareRun({
  batchDir,
  task,
  condition,
  i,
  mode,
  prompt = "explicit",
}) {
  const runRoot = join(
    batchDir,
    `${task}--${condition}--${String(i).padStart(3, "0")}`
  )
  const work = join(runRoot, "work")
  const home = join(runRoot, "home")
  const tmp = join(runRoot, "tmp")
  for (const dir of [work, join(home, ".claude"), tmp])
    mkdirSync(dir, { recursive: true })
  if (insideRepo(runRoot))
    throw new Error(`run directory ${runRoot} is inside the repository`)
  assembleStarter({ task, condition, dest: work, mode, prompt })
  // Relative .bin links stay relative; real files everywhere else.
  cpSync(shippedNodeModules(condition), join(work, "node_modules"), {
    recursive: true,
    verbatimSymlinks: true,
  })
  writeFileSync(join(work, ".gitignore"), "node_modules\n")
  spawnSync(
    "sh",
    [
      "-c",
      "git init -q && git add -A && git -c user.name=eval -c user.email=eval@localhost commit -qm starter",
    ],
    { cwd: work, env: { PATH: process.env.PATH, HOME: home } }
  )
  const promptFile = join(runRoot, "prompt.md")
  writeFileSync(promptFile, renderPrompt(task, condition, mode, prompt))
  return { runRoot, work, home, tmp, promptFile }
}

/**
 * The agent's environment: nothing of the host's but PATH and ONE credential
 * (`auth`, from harness/auth.mjs `resolveAuth`); HOME,
 * CLAUDE_CONFIG_DIR and TMPDIR inside the run. The host's ~/.claude
 * (settings, memory, OAuth login, MCP servers) is therefore not visible.
 */
export function agentEnv({ home, tmp }, auth) {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: home,
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
    TMPDIR: tmp,
    // The CLI keeps its own scratch under /tmp/claude-<uid> regardless of
    // TMPDIR; that directory is shared with every other session on the host
    // and the sandbox denies it. This moves it inside the run.
    CLAUDE_CODE_TMPDIR: tmp,
    LANG: "en_US.UTF-8",
    ...(auth ? { [auth.name]: auth.value } : {}),
  }
}

/**
 * A run directory with nothing in work/: what the preflight call runs in, so
 * it gets exactly the isolation (environment, sandbox) a real run gets.
 */
export function prepareBareRun({ batchDir, name = "preflight" }) {
  const runRoot = join(batchDir, name)
  const work = join(runRoot, "work")
  const home = join(runRoot, "home")
  const tmp = join(runRoot, "tmp")
  for (const dir of [work, join(home, ".claude"), tmp])
    mkdirSync(dir, { recursive: true })
  if (insideRepo(runRoot))
    throw new Error(`run directory ${runRoot} is inside the repository`)
  return { runRoot, work, home, tmp }
}
