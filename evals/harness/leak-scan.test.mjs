// Tests of the leak audit (harness/leak-scan.mjs) on synthetic Claude Code
// stream-json transcripts, both directions.
//
//   node --test harness/leak-scan.test.mjs
import { strict as assert } from "node:assert"
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, describe, it } from "node:test"
import { scanTranscript } from "./leak-scan.mjs"

let runDir
const hidden =
  "/Users/someone/ic-reactor/evals/tasks/react-wallet/hidden/react-wallet.test.ts"
const OK = { is_error: false, content: "ok" }
const DENIED = {
  is_error: true,
  content: "EPERM: operation not permitted, open",
}

before(() => {
  runDir = mkdtempSync(join(tmpdir(), "leak-scan-test-"))
  mkdirSync(join(runDir, "src"))
  writeFileSync(join(runDir, "src", "Wallet.tsx"), "")
})
after(() => rmSync(runDir, { recursive: true, force: true }))

/**
 * A stream-json transcript: init, then per call an assistant tool_use and a
 * user tool_result (default: success), then the result message.
 */
function transcript(calls, dir = runDir) {
  const lines = [{ type: "system", subtype: "init", cwd: dir }]
  calls.forEach(([name, input, result = OK], i) => {
    lines.push({
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "working" },
          { type: "tool_use", id: `toolu_${i}`, name, input },
        ],
      },
    })
    lines.push({
      type: "user",
      message: {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: `toolu_${i}`, ...result },
        ],
      },
    })
  })
  lines.push({
    type: "result",
    subtype: "success",
    is_error: false,
    num_turns: 3,
  })
  return lines.map((l) => JSON.stringify(l)).join("\n") + "\n"
}

const scan = (calls, dir = runDir) =>
  scanTranscript(transcript(calls, dir), { runDir: dir })

describe("clean runs are not contaminated", () => {
  it("tool calls inside the run dir, including normalised look-alikes", () => {
    const result = scan([
      ["Read", { file_path: join(runDir, "docs", "llms.txt") }],
      ["Read", { file_path: "src/Wallet.tsx" }],
      ["Read", { file_path: "src/../package.json" }],
      [
        "Read",
        { file_path: join(runDir, "node_modules", "react", "package.json") },
      ],
      [
        "Edit",
        {
          file_path: join(runDir, "src", "Wallet.tsx"),
          old_string: "a",
          new_string: "b",
        },
      ],
      ["Write", { file_path: join(runDir, "src", "ledger.ts"), content: "x" }],
      ["Glob", { pattern: "src/**/*.ts" }],
      [
        "Grep",
        {
          pattern: "useQuery|/etc/passwd",
          path: "node_modules/@candid-core/schema",
        },
      ],
      ["Bash", { command: "npx tsc --noEmit 2>/dev/null" }],
      ["Bash", { command: "npx vitest run --reporter=dot" }],
      ["Bash", { command: "ls ./src && cat package.json | head -20" }],
      ["Bash", { command: "ls src/.. && ls $PWD/src && ls ${PWD}/src" }],
      ["Bash", { command: "cd src && cat ../package.json" }],
      ["Bash", { command: "cd .. && ls" }], // back from src to the run dir
      ["Bash", { command: "echo $(date) $NODE_ENV" }],
      [
        "Bash",
        { command: `node -e "console.log(require('./package.json').name)"` },
      ],
    ])
    assert.equal(
      result.contaminated,
      false,
      JSON.stringify(result.violations, null, 2)
    )
    assert.equal(result.attempts, 0)
    assert.equal(result.toolCalls, 16)
  })

  it("accepts the /private alias of a macOS temp dir", () => {
    const real = realpathSync(runDir)
    assert.equal(
      scan([["Read", { file_path: join(real, "src", "Wallet.tsx") }]])
        .contaminated,
      false
    )
  })

  it("accepts paths inside the target of a node_modules symlink", () => {
    const dir = mkdtempSync(join(tmpdir(), "leak-scan-link-"))
    const target = mkdtempSync(join(tmpdir(), "leak-scan-target-"))
    mkdirSync(join(target, "react"))
    symlinkSync(target, join(dir, "node_modules"), "dir")
    try {
      const result = scan(
        [
          [
            "Read",
            { file_path: join(realpathSync(target), "react", "index.js") },
          ],
        ],
        dir
      )
      assert.equal(
        result.contaminated,
        false,
        JSON.stringify(result.violations)
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(target, { recursive: true, force: true })
    }
  })

  it("an agent that made no tool calls is clean", () => {
    const result = scanTranscript(transcript([]), { runDir })
    assert.equal(result.contaminated, false)
    assert.equal(result.toolCalls, 0)
  })
})

describe("successful outside access is contaminated", () => {
  const cases = {
    "Read of a hidden test by absolute path": ["Read", { file_path: hidden }],
    "Read climbing out with ..": [
      "Read",
      { file_path: "../../ic-reactor/evals/tasks/x.ts" },
    ],
    "Read of ./../x": ["Read", { file_path: "./../x" }],
    "Bash cat of an absolute path": ["Bash", { command: `cat ${hidden}` }],
    "Bash cat ./../x": ["Bash", { command: "cat ./../x" }],
    "Bash cat src/../../x": ["Bash", { command: "cat src/../../x" }],
    "Bash cd a/../..": ["Bash", { command: "cd src/../.. && ls" }],
    "Bash cd out of the run dir": ["Bash", { command: "cd .. && ls" }],
    "Bash cd to an absolute dir, then a relative read": [
      "Bash",
      { command: "cd /tmp; cat notes.txt" },
    ],
    "Bash $PWD/..": ["Bash", { command: "ls $PWD/.." }],
    "Bash ${PWD}/..": ["Bash", { command: "ls ${PWD}/.." }],
    "Bash $(pwd)/..": ["Bash", { command: "ls $(pwd)/.." }],
    "Bash $TMPDIR": ["Bash", { command: "ls $TMPDIR" }],
    "Bash cd $OLDPWD": ["Bash", { command: "cd $OLDPWD && ls" }],
    "Bash ~root": ["Bash", { command: "ls ~root" }],
    "Bash ~ (home)": ["Bash", { command: "ls ~/Coding" }],
    "Bash $HOME": ["Bash", { command: "cat $HOME/.ssh/config" }],
    "Bash $(dirname $PWD)": ["Bash", { command: "ls $(dirname $PWD)" }],
    "Bash printf-built path": [
      "Bash",
      { command: "cat $(printf '/Us%sers/x' '')" },
    ],
    "Bash an unknown variable in a path": [
      "Bash",
      { command: "cat $SECRET_DIR/x" },
    ],
    "Bash with a path inside a script string": [
      "Bash",
      {
        command: `node -e "console.log(require('fs').readFileSync('${hidden}','utf8'))"`,
      },
    ],
    "Bash with a path after --flag=": [
      "Bash",
      { command: `npx vitest run --root=${hidden}` },
    ],
    "Grep over an outside directory": [
      "Grep",
      { pattern: "it\\(", path: "/Users/someone" },
    ],
    "Glob with an absolute pattern": [
      "Glob",
      { pattern: "/Users/**/hidden/*.test.ts" },
    ],
    "Glob climbing out": ["Glob", { pattern: "../**/*.test.ts" }],
    "LS of the parent": ["LS", { path: ".." }],
    "a network tool that ran": [
      "WebFetch",
      { url: "https://ic-reactor.b3pay.net/llms-full.txt", prompt: "read" },
    ],
  }
  for (const [name, call] of Object.entries(cases)) {
    it(name, () => {
      const result = scan([["Read", { file_path: "src/Wallet.tsx" }], call])
      assert.equal(
        result.contaminated,
        true,
        `not flagged: ${JSON.stringify(call)}`
      )
      assert.ok(result.violations.every((v) => !v.blocked))
    })
  }

  it("a cd out of the run dir taints later relative commands in later calls", () => {
    const result = scan([
      ["Bash", { command: "cd /" }],
      ["Bash", { command: "ls" }],
    ])
    assert.equal(result.contaminated, true)
    assert.ok(
      result.violations.some(
        (v) => v.reason === "command runs outside the run directory"
      )
    )
  })

  it("a transcript with no JSON cannot be audited", () => {
    const result = scanTranscript("Done! I implemented the wallet.\n", {
      runDir,
    })
    assert.equal(result.contaminated, true)
    assert.equal(result.auditable, false)
  })

  it("finds tool calls in a single JSON array transcript too", () => {
    const doc = JSON.stringify([
      {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "Read",
              input: { file_path: hidden },
            },
          ],
        },
      },
    ])
    assert.equal(scanTranscript(doc, { runDir }).contaminated, true)
  })
})

describe("blocked outside access is an attempt, not contamination", () => {
  it("a Read the sandbox refused", () => {
    const result = scan([["Read", { file_path: hidden }, DENIED]])
    assert.equal(result.contaminated, false)
    assert.equal(result.attempts, 1)
    assert.equal(result.violations[0].blocked, true)
  })

  it("a shell read whose output reports the refusal", () => {
    const result = scan([
      [
        "Bash",
        { command: `cat ${hidden}` },
        { is_error: false, content: `cat: ${hidden}: Operation not permitted` },
      ],
    ])
    assert.equal(result.contaminated, false)
    assert.equal(result.attempts, 1)
  })

  it("a network tool the CLI refused (disallowed)", () => {
    const result = scan([
      [
        "WebFetch",
        { url: "https://example.org" },
        { is_error: true, content: "tool not allowed" },
      ],
    ])
    assert.equal(result.contaminated, false)
    assert.equal(result.attempts, 1)
  })

  it("one successful outside read among refused ones still contaminates", () => {
    const result = scan([
      ["Read", { file_path: hidden }, DENIED],
      ["Bash", { command: "cat ~/notes.txt" }, OK],
    ])
    assert.equal(result.contaminated, true)
    assert.equal(result.attempts, 2)
  })
})

// From the first pilot (react-wallet/thin 002 and 004): code and patterns
// inside Bash commands were parsed as shell path words.
describe("source text and patterns are not shell paths", () => {
  const nm = () => join(runDir, "node_modules")
  it("grep / sed / awk / jq patterns (the pilot's `/\\*\\*` and `/call`)", () => {
    const result = scan([
      [
        "Bash",
        {
          command: `cd ${nm()} && cat @candid-core/schema/dist/actor.d.ts | grep -v "^\\s*\\*\\|/\\*\\*" | head -70`,
        },
      ],
      [
        "Bash",
        {
          command: `cd ${runDir}; grep -n "call\\b\\|/call" src/Wallet.tsx | head -30`,
        },
      ],
      [
        "Bash",
        {
          command:
            "sed -n '/^export/,/^}/p' src/Wallet.tsx && awk '/\\/api\\//{print}' src/Wallet.tsx",
        },
      ],
      [
        "Bash",
        {
          command: "rg -n '/canister/[^/]+/call' src && jq '.a/2' package.json",
        },
      ],
    ])
    assert.equal(
      result.contaminated,
      false,
      JSON.stringify(result.violations, null, 2)
    )
    assert.equal(result.attempts, 0, JSON.stringify(result.violations, null, 2))
  })

  it("code given to node -e: comments, regex literals, template literals, JSX", () => {
    const code =
      "/** doc */ const fmt = (v) => { const whole = v / 100n; const frac = v % 100n; " +
      "return `${whole}.${frac}` }; // done\n" +
      "if (/^\\/api\\/v\\d+\\/canister\\/[^/]+\\/call$/.test(url)) console.log('/call', '</button>')"
    const result = scan([
      ["Bash", { command: `node -e '${code.replaceAll("'", '"')}'` }],
    ])
    assert.equal(result.attempts, 0, JSON.stringify(result.violations, null, 2))
  })

  it("a heredoc writing source into the run", () => {
    const body = [
      'import { Wallet } from "../src/Wallet"',
      "/** A test. */",
      "const label = `Sent (block ${result.value})` // template, not a substitution",
      "export const View = () => <p><span>{label}</span><button>Send</button></p>",
      "const re = /\\/call$/",
    ].join("\n")
    const result = scan([
      [
        "Bash",
        {
          command: `cat > test/wallet.test.tsx <<'EOF'\n${body}\nEOF\nnpx vitest run`,
        },
      ],
    ])
    assert.equal(result.attempts, 0, JSON.stringify(result.violations, null, 2))
  })
})

describe("the new parsing does not open new holes", () => {
  const hiddenPath =
    "/Users/someone/ic-reactor/evals/tasks/react-wallet/hidden/react-wallet.test.ts"
  const cases = {
    "a script written by heredoc, then run": `cat > x.js <<'EOF'\nconsole.log(require('fs').readFileSync('${hiddenPath}', 'utf8'))\nEOF\nnode x.js`,
    "a heredoc fed to node that climbs out":
      "node <<'EOF'\nrequire('fs').readFileSync('../../evals/tasks/x.ts')\nEOF",
    "node -e reading the home directory":
      "node -e \"require('fs').readdirSync('~/Coding')\"",
    "bash -c with an outside path": `bash -c 'cat ${hiddenPath}'`,
    "xargs with an outside path": "echo x | xargs cat /etc/passwd",
    "echo feeding a path to xargs": `echo ${hiddenPath} | xargs cat`,
    "grep's file argument after its pattern": "grep -rn secret /Users/someone",
    "sed's file argument after its script": "sed -n 1p -- /etc/hosts",
    "a redirect from outside": "wc -l < /etc/passwd",
    "a command substitution that runs cat outside": `echo "$(cat ${hiddenPath})"`,
  }
  for (const [name, command] of Object.entries(cases)) {
    it(name, () => {
      const result = scan([["Bash", { command }]])
      assert.equal(result.contaminated, true, `not flagged: ${command}`)
    })
  }
})

describe("blocked is judged per violation", () => {
  it("a refusal naming one path does not cover another path in the same call", () => {
    const result = scan([
      [
        "Bash",
        { command: "cat /Users/a/secret; cat /Users/b/secret" },
        {
          is_error: false,
          content:
            "cat: /Users/a/secret: Operation not permitted\nthe contents of b",
        },
      ],
    ])
    const [a, b] = result.violations
    assert.equal(a.blocked, true)
    assert.equal(b.blocked, false)
    assert.equal(result.contaminated, true)
  })
  it("ordinary output that happens to contain 'denied' is not a refusal", () => {
    const result = scan([
      [
        "Bash",
        { command: "cat /Users/a/secret" },
        {
          is_error: false,
          content: "access denied by policy (just file text)",
        },
      ],
    ])
    assert.equal(result.contaminated, true)
  })
})
