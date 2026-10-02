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

// The sandbox leaves the network open (the agent CLI needs its API) and
// `node` runs inside it, so the transcript is the only line against an agent
// reading, say, the published ic-reactor 3 guide from the shell.
const GUIDE = "https://ic-reactor.b3pay.net/llms-full.txt"

describe("network use from the shell is contamination when it ran", () => {
  const cases = {
    "node -e fetching the published guide": `node -e "fetch('${GUIDE}').then((r) => r.text()).then(console.log)"`,
    "node -e with https.get": `node -e "require('https').get('${GUIDE}', (r) => r.pipe(process.stdout))"`,
    "node -e importing node:https": `node --input-type=module -e "import { get } from 'node:https'; get('${GUIDE}', (r) => r.pipe(process.stdout))"`,
    "node -e fetching a URL given as an argument": `node -e "fetch(process.argv[1]).then((r) => r.text()).then(console.log)" ${GUIDE}`,
    "node -e building the host": String.raw`node -e "const h = 'ic-reactor.b3pay.net'; fetch(\`https://\${h}/llms-full.txt\`).then(console.log)"`,
    "node -e running curl through child_process": `node -e "require('child_process').execSync('curl -s ${GUIDE}', { stdio: 'inherit' })"`,
    "env in front of node -e": `env NODE_OPTIONS= node -e "fetch('${GUIDE}').then(console.log)"`,
    "a heredoc fed to node": `node <<'EOF'\nconst r = await fetch("${GUIDE}")\nconsole.log(await r.text())\nEOF`,
    "code piped into node": `echo "fetch('${GUIDE}').then((r) => r.text()).then(console.log)" | node`,
    "a heredoc piped through cat into node": `cat <<'EOF' | node\nfetch("${GUIDE}").then((r) => r.text()).then(console.log)\nEOF`,
    "a script written by heredoc, then run": `cat > docs.mjs <<'EOF'\nconsole.log(await (await fetch("${GUIDE}")).text())\nEOF\nnode docs.mjs`,
    "python3 -c with urllib": `python3 -c "import urllib.request; print(urllib.request.urlopen('${GUIDE}').read())"`,
    curl: `curl -s ${GUIDE}`,
    wget: `wget -qO- ${GUIDE}`,
    "curl behind env": `env -i curl -s ${GUIDE}`,
    "curl in bash -c": `bash -c 'curl -s ${GUIDE}'`,
    "curl through xargs": `echo ${GUIDE} | xargs curl -s`,
    "curl through xargs sh -c": `echo ${GUIDE} | xargs -I{} sh -c 'curl -s {}'`,
    "curl in a command substitution": `echo "$(curl -s ${GUIDE})"`,
    "a shell script written in the run, then run": `printf 'curl -s ${GUIDE}' > get.sh && sh get.sh`,
    "npm view": "npm view @ic-reactor/react readme",
    "npx of a package the run does not have": "npx -y @ic-reactor/cli@3 --help",
    "pnpm add": "pnpm add @ic-reactor/core@3.13.0",
    "pip through python -m": "python3 -m pip download ic-reactor",
    "git clone": "git clone https://github.com/B3Pay/ic-reactor ref",
  }
  for (const [name, command] of Object.entries(cases)) {
    it(name, () => {
      const result = scan([
        ["Read", { file_path: "src/Wallet.tsx" }],
        ["Bash", { command }],
      ])
      assert.equal(result.contaminated, true, `not flagged: ${command}`)
      assert.ok(
        result.violations.some((v) => v.network && !v.blocked),
        JSON.stringify(result.violations, null, 2)
      )
    })
  }

  it("a script written with Write, then run with node", () => {
    const result = scan([
      [
        "Write",
        {
          file_path: join(runDir, "docs.mjs"),
          content: `const r = await fetch("${GUIDE}")\nconsole.log(await r.text())\n`,
        },
      ],
      ["Bash", { command: "node docs.mjs" }],
    ])
    assert.equal(result.contaminated, true)
    assert.match(result.violations[0].reason, /a script written in this run/)
  })

  it("a script written by its /private path, run by a relative one", () => {
    const result = scan([
      [
        "Write",
        {
          file_path: join(realpathSync(runDir), "docs.mjs"),
          content: `console.log(await (await fetch("${GUIDE}")).text())\n`,
        },
      ],
      ["Bash", { command: "node ./docs.mjs" }],
    ])
    assert.equal(result.contaminated, true, JSON.stringify(result.violations))
  })

  it("a script written clean, then edited to fetch, then run", () => {
    const result = scan([
      ["Write", { file_path: "probe.mjs", content: "console.log(1)\n" }],
      [
        "Edit",
        {
          file_path: join(runDir, "probe.mjs"),
          old_string: "console.log(1)",
          new_string: `console.log(await (await fetch("${GUIDE}")).text())`,
        },
      ],
      ["Bash", { command: `cd ${runDir} && node ./probe.mjs` }],
    ])
    assert.equal(result.contaminated, true, JSON.stringify(result.violations))
  })
})

describe("network use that was refused or failed is an attempt", () => {
  it("a curl the CLI did not allow", () => {
    const result = scan([
      [
        "Bash",
        { command: `curl -s ${GUIDE}` },
        { is_error: true, content: "This command requires approval" },
      ],
    ])
    assert.equal(result.contaminated, false)
    assert.equal(result.attempts, 1)
  })
  it("a node fetch that failed", () => {
    const result = scan([
      [
        "Bash",
        { command: `node -e "fetch('${GUIDE}').then(console.log)"` },
        { is_error: true, content: "TypeError: fetch failed" },
      ],
    ])
    assert.equal(result.contaminated, false)
    assert.equal(result.attempts, 1)
  })
})

describe("clean look-alikes are not network use", () => {
  it("local commands, local hosts, URLs as data, and code that only edits text", () => {
    const result = scan([
      ["Bash", { command: "npx tsc --noEmit && npx vitest run" }],
      ["Bash", { command: "npx --yes vitest run test/smoke.test.ts" }],
      [
        "Bash",
        { command: "npm test && npm run build && pnpm typecheck && yarn test" },
      ],
      [
        "Bash",
        { command: "git status --short && git log --oneline && git diff" },
      ],
      [
        "Bash",
        {
          command:
            'grep -rn "https://icp-api.io" src && echo https://icp-api.io',
        },
      ],
      [
        "Bash",
        {
          command: `node -e "console.log(new URL('https://icp-api.io').host)"`,
        },
      ],
      [
        "Bash",
        {
          command: `node -e "fetch('http://127.0.0.1:4943/api/v2/status').then((r) => console.log(r.status))"`,
        },
      ],
      [
        "Bash",
        {
          command:
            "node -e 'import(\"@icp-sdk/core/principal\").then(({ Principal }) => console.log(Principal.anonymous().toText()))'",
        },
      ],
      [
        "Bash",
        {
          command:
            "node -e 'const real = globalThis.fetch; globalThis.fetch = (...a) => real(...a); console.log(typeof fetch)'",
        },
      ],
      [
        "Bash",
        {
          command:
            "node -e '/* no fetch(https://icp-api.io) here */ console.log(require(\"./package.json\").name)'",
        },
      ],
      // Source written to a file is data until it runs; vitest is not followed.
      [
        "Bash",
        {
          command:
            "cat > src/index.ts <<'EOF'\nconst MAINNET = \"https://icp-api.io\"\nexport const send = (url: string) => fetch(url)\nEOF\nnpx tsc --noEmit && npx vitest run",
        },
      ],
      [
        "Write",
        {
          file_path: join(runDir, "src", "ledger.ts"),
          content:
            'const host = "https://icp-api.io"\nexport const probe = () => fetch(`${host}/api/v2/status`)\n',
        },
      ],
      ["Bash", { command: "npx vitest run" }],
      // Edit scripts whose text holds fetch( and a URL (the pilots' shape).
      [
        "Bash",
        {
          command:
            'node <<\'EOF\'\nconst fs = require("fs")\nconst p = "src/index.ts"\nfs.writeFileSync(p, fs.readFileSync(p, "utf8").replace("fetch(input)", "fetch(input, init) // https://icp-api.io"))\nEOF',
        },
      ],
      [
        "Bash",
        {
          command:
            "python3 - <<'E'\np='src/index.ts'\ns=open(p).read()\ns=s.replace('''const r = await fetch(url)''','''const r = await fetch(url, { signal }) // https://icp-api.io''')\nopen(p,'w').write(s)\nE",
        },
      ],
      // A script that only reaches the local replica.
      [
        "Write",
        {
          file_path: "probe.mjs",
          content:
            'console.log((await fetch("http://127.0.0.1:4943/api/v2/status")).status)\n',
        },
      ],
      ["Bash", { command: "node probe.mjs" }],
    ])
    assert.equal(result.attempts, 0, JSON.stringify(result.violations, null, 2))
  })
})
