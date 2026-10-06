// Leak audit for one agent run, the second line of defence behind the OS
// sandbox (harness/sandbox.mjs): finds every tool call in the agent's
// transcript whose path or command reaches outside the run directory, and
// whether it succeeded.
//
// The transcript is what Claude Code prints with `--output-format stream-json
// --verbose`: one JSON message per line, tool calls as content blocks
// `{ type: "tool_use", id, name, input }` and their outcomes as
// `{ type: "tool_result", tool_use_id, is_error, content }`. The scan walks
// every JSON value for such blocks rather than trusting one exact envelope, so
// a single JSON document or an array of messages works too.
//
// A tool call is a violation when it
// - names a file or directory (`file_path`, `path`, `notebook_path`, a Glob
//   `pattern`, a Grep `glob`) that resolves outside the run directory;
// - runs a shell command that reaches outside. Commands are lexed as a shell
//   would (quotes, escapes, operators, redirections, heredocs, `$(…)` and
//   backticks), and each word is judged by its position:
//   - arguments and redirection targets of ordinary commands are paths:
//     normalised (`./../x`, `a/../..`, `$PWD/..`, `${PWD}/..`, `~`, `~user`,
//     `$HOME`) and resolved from the shell's current directory, which `cd`
//     moves; `$TMPDIR`, `$TMP`, `$TEMP`, `$OLDPWD`, any other variable
//     followed by `/`, and a command substitution that builds a path
//     (`$(pwd)/..`, `$(dirname $PWD)`, `$(printf …)`) cannot be resolved and
//     are flagged;
//   - the pattern/program argument of grep, egrep, fgrep, rg, ag, sed, awk,
//     gawk and jq is not a path (`grep "/call" file` reads `file`);
//   - code given to an interpreter (`node -e '…'`, `python -c '…'`, a heredoc
//     fed to one) is not shell: only its string literals are checked — ones
//     under a user-data root (`/Users`, `/home`, `/private`, `/var`, `/tmp`,
//     `/etc`, `/Volumes`, `/opt`, `/root`), `~`, or climbing with `..`;
//   - the text of a heredoc written to a file is data, checked only for
//     string literals under a user-data root (a script written now and run
//     later);
//   - `sh -c` / `bash -c` bodies, `xargs` commands and command substitutions
//     run, so they are scanned as shell in turn;
// - uses a network tool (WebFetch, WebSearch);
// - uses the network from the shell. The OS sandbox leaves the network open
//   (the agent CLI needs its API), and `node` runs in it, so this is the only
//   line there. Flagged: a network command (curl, wget, nc, ssh, …); a
//   package manager or git command that reaches a registry or remote (`npm
//   view`, `pnpm add`, `npx <a package the run does not have>`, `pip
//   install`, `git clone`, …); a URL of a non-local host given to an
//   interpreter; and interpreter code (`node -e`, `python -c`, a heredoc or
//   pipe fed to one, or a script written in the run by Write, Edit or a
//   heredoc and then run with an interpreter) that calls the network
//   (`fetch(`, `http(s).get/request`, `net`/`tls`, WebSocket, `urllib`,
//   `requests`, …) towards a non-local host or a host it does not name, or
//   that runs a network command through `child_process` / `subprocess`.
//   String literals are data, not calls: an edit script whose text holds
//   `fetch(` or a URL is not network use, and neither is code that only
//   names local hosts (`localhost`, `127.*`, `[::1]`). Source written to a
//   file is not flagged until it is run. Not followed: tests run by vitest
//   (the agent's own tests name mainnet hosts, which the public scaffold's
//   fake replica answers; a test fetching another URL is not seen) and a
//   host reached through a library such as an `HttpAgent`.
// A violation is `blocked` when the call failed (`is_error`) or its output
// reports a permission refusal (`Operation not permitted`, `EPERM`, `EACCES`,
// `Permission denied`) naming that path — or, when it is the call's only
// violation, reports one at all. The run is contaminated when any violation
// was NOT blocked — a successful outside read — or when the transcript holds
// no parseable JSON (it cannot be audited). The run's own node_modules counts
// as inside, including the target of a node_modules symlink.
//
// The CLI's persisted tool output (PREREGISTRATION.md, Addendum 5). When a
// tool's output is too large, the CLI saves it under the run's own home and
// answers the call with a notice instead. A Read (`file_path`) or Grep
// (`path`) of such a file is not a violation when all of these hold, and is
// judged as any other path otherwise:
// - the run directory is `<run>/work`, and the path, resolved as every path
//   here is (lexically: `.`, `..`, `//`, `~`, `$HOME`; no symlink is
//   followed), is exactly
//   `<run>/home/.claude/projects/<one segment>/<one segment>/tool-results/<one file name>`;
// - the path as written has no `..` segment;
// - an earlier tool_result in the transcript, in a user message (never in an
//   assistant message), is the CLI's notice as a whole — `<persisted-output>`,
//   then "Output too large (<size>). Full output saved to: <path>", …,
//   `</persisted-output>` — and names exactly that path, already normalised;
// - that tool_result answers an earlier tool call that is not a Read and in
//   which the scan found no violation, blocked or not;
// - if the file still exists when the scan runs (the driver scans before it
//   removes the run), its real path is the same path: no symlink on the way.
// A Bash command that names the path (`cat <path>`) is still a violation.
import { existsSync, realpathSync } from "node:fs"
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path"
import { homedir } from "node:os"

const SAFE = new Set([
  "/dev/null",
  "/dev/stdout",
  "/dev/stderr",
  "/dev/stdin",
  "/dev/tty",
])
const NETWORK_TOOLS = new Set(["WebFetch", "WebSearch"])
const PATH_FIELDS = ["file_path", "path", "notebook_path"]
const OUTSIDE_VARS = new Set(["TMPDIR", "TMP", "TEMP", "OLDPWD"])
const PERMISSION = /Operation not permitted|EPERM|EACCES|Permission denied/i
const PATHY_SUBST = /pwd|dirname|realpath|readlink|printf|echo|cd\b|\.\.|\/|\$/
// Where user data lives: an absolute string literal in code is only suspect
// under one of these (not `/call`, `/**`, `/api/v2/...`).
const USER_DATA_ROOT =
  /^\/(Users|home|private|var|tmp|etc|Volumes|opt|root)(\/|$)/
const PATTERN_COMMANDS = new Set([
  "grep",
  "egrep",
  "fgrep",
  "rg",
  "ag",
  "sed",
  "awk",
  "gawk",
  "jq",
])
const INTERPRETERS = new Set([
  "node",
  "nodejs",
  "bun",
  "deno",
  "tsx",
  "ts-node",
  "python",
  "python3",
  "ruby",
  "perl",
  "php",
])
const CODE_FLAGS = new Set([
  "-e",
  "--eval",
  "-p",
  "--print",
  "-c",
  "-r",
  "--exec",
])
const SHELLS = new Set(["sh", "bash", "zsh", "dash"])
// The CLI's persisted-output notice, as the whole content of a tool_result.
const PERSISTED_NOTICE =
  /^<persisted-output>\nOutput too large \([^()\n]+\)\. Full output saved to: ([^\n]+)\n[\s\S]*\n<\/persisted-output>$/
// Where the CLI persists it, relative to `<run>`: one project, one session.
const PERSISTED_PATH =
  /^home\/\.claude\/projects\/[^/]+\/[^/]+\/tool-results\/[^/]+$/
// The tool and field that may read a persisted output back.
const PERSISTED_READERS = { Read: "file_path", Grep: "path" }

// ---------------------------------------------------------------- network
const words = (text) => new Set(text.trim().split(/\s+/))
// Commands that reach the network whatever their arguments.
const NETWORK_COMMANDS = words(`
  curl wget nc ncat netcat telnet socat ssh scp sftp ftp http https xh aria2c
  lynx w3m links elinks dig nslookup host whois
`)
// Package-manager subcommands that reach the registry (npm's aliases too).
const REGISTRY_SUBCOMMANDS = words(`
  install i in ins inst insta instal isnt isnta isntal isntall add a ci
  clean-install ic install-clean install-test it install-ci-test cit update up
  upgrade udpate view v info show search s se find outdated audit publish
  unpublish deprecate dist-tag dist-tags docs home repo bugs issues create
  login adduser logout whoami ping owner access team token star unstar stars
  doctor fetch dedupe ddp
`)
const PACKAGE_MANAGERS = words("npm pnpm yarn bun")
// Subcommands that run a package, installing it first when the run lacks it.
const PACKAGE_RUN_SUBCOMMANDS = {
  npm: words("exec x"),
  pnpm: words("dlx"),
  yarn: words("dlx"),
  bun: words("x"),
}
const PACKAGE_RUNNERS = words("npx pnpx bunx")
// What every starter has installed: `npx tsc`, `npx vitest` stay local.
const LOCAL_PACKAGES = words("tsc vitest typescript")
const GIT_REMOTE = words("clone fetch pull push ls-remote submodule")
const PIP_REMOTE = words("install download index search wheel")
// Prefixes that run the command after them.
const WRAPPERS = words(
  "env command exec nohup time timeout nice stdbuf sudo doas"
)
// In interpreted code with its string literals removed: calls that reach the
// network (JS, Python, Ruby, Perl, PHP). A member call `x.fetch(` is not a
// global fetch.
const NETWORK_CALLS = new RegExp(
  [
    String.raw`(?<![\w$.])fetch\s*\(`,
    String.raw`\b(globalThis|window|self)\s*\.\s*fetch\s*\(`,
    String.raw`\bnew\s+(WebSocket|EventSource|XMLHttpRequest)\b`,
    String.raw`\b(https?|http2|net|tls|dgram|dns)\s*\.\s*(get|request|connect|createConnection|lookup|resolve\w*)\s*\(`,
    String.raw`\burlopen\s*\(`,
    String.raw`\brequests\s*\.\s*(get|post|put|patch|head|delete|request|Session)\b`,
    String.raw`^[ \t]*import\s+(urllib|urllib3|http\.client|requests|httpx|aiohttp|socket|ftplib)\b`,
    String.raw`^[ \t]*from\s+(urllib|urllib3|http|requests|httpx|aiohttp|socket|ftplib)(\.\w+)*\s+import\b`,
    String.raw`Net::HTTP|URI\.open|LWP::|HTTP::Tiny|IO::Socket|\bcurl_exec\b|\bfsockopen\b|\bfile_get_contents\s*\(`,
  ].join("|"),
  "m"
)
// Modules whose loading in JS code means network use, or running commands.
const NETWORK_MODULES =
  /^(node:)?(https?|http2|net|tls|dgram|dns(\/promises)?|undici|axios|node-fetch|got|ky|ws|superagent|request|open-uri)$/
const SPAWN_MODULES = /^(node:)?child_process$/
const SPAWN_CALLS =
  /^[ \t]*(import\s+subprocess\b|from\s+subprocess\s+import\b)|\bos\s*\.\s*(system|popen)\s*\(/m
// `require("x")`, `import("x")`, `from "x"`, `import "x"` over a skeleton in
// which every string literal is `"S<n>"`.
const MODULE_SPECIFIERS =
  /\b(?:require|import)\s*\(\s*"S(\d+)"|\bfrom\s*"S(\d+)"|\bimport\s*"S(\d+)"/g
const URLS = /\b(?:https?|wss?|ftp):\/\/([^\s/?#'"`<>\\]*)/gi

function realpathOrSelf(p) {
  try {
    return realpathSync(p)
  } catch {
    return p
  }
}

function roots(runDir) {
  const list = new Set([resolve(runDir), realpathOrSelf(resolve(runDir))])
  const nm = join(runDir, "node_modules")
  if (existsSync(nm)) list.add(realpathOrSelf(nm))
  return [...list]
}

const inside = (p, allowed) =>
  allowed.some((root) => p === root || p.startsWith(root + sep))

/** `~`, `~user`, `$HOME`, `$PWD`, then resolution from `cwd`. */
function expand(raw, cwd) {
  let p = raw
  if (p === "~" || p.startsWith("~/")) p = join(homedir(), p.slice(1))
  else if (/^~[A-Za-z_][\w.-]*/.test(p)) {
    const [user, ...rest] = p.slice(1).split("/")
    p = join(dirname(homedir()), user, ...rest)
  }
  p = p
    .replace(/\$\{HOME\}|\$HOME\b/g, homedir())
    .replace(/\$\{PWD\}|\$PWD\b/g, cwd)
  return isAbsolute(p) ? resolve(p) : resolve(cwd, p)
}

/** A file's key in the map of files the run wrote: /private/var = /var. */
const fileKey = (p) => p.replace(/^\/private(?=\/(var|tmp|etc)\/)/, "")

/** The part of a glob pattern before its first wildcard. */
const globBase = (pattern) => pattern.split(/[*?[{]/)[0] || "."

// ---------------------------------------------------------------- the lexer

/** Reads a balanced `$( … )` starting after `$(`; returns [body, end]. */
function readParen(s, i) {
  let depth = 1
  let j = i
  let quote = ""
  for (; j < s.length; j += 1) {
    const ch = s[j]
    if (quote) {
      if (ch === "\\" && quote === '"') j += 1
      else if (ch === quote) quote = ""
      continue
    }
    if (ch === "'" || ch === '"') quote = ch
    else if (ch === "(") depth += 1
    else if (ch === ")") {
      depth -= 1
      if (depth === 0) break
    }
  }
  return [s.slice(i, j), j + 1]
}

/**
 * Lexes a command line into words and operators. A word is
 * `{ text, subs, vars, quoted }`: `text` its value with quotes removed,
 * `subs` the command substitutions active in it, `vars` the variables
 * expanded in it. Heredoc bodies are returned separately, each tied to the
 * segment (by index) whose command reads it.
 */
export function lexShell(s) {
  const tokens = []
  const heredocs = []
  const pending = []
  let word = null
  const start = () =>
    (word ??= { text: "", subs: [], vars: [], quoted: false, raw: "" })
  const end = () => {
    if (word) tokens.push({ type: "word", ...word })
    word = null
  }
  const op = (text) => {
    end()
    tokens.push({ type: "op", text })
  }
  const readVar = (i, w) => {
    const m = /^\$(\{[^}]*\}|[A-Za-z_][A-Za-z0-9_]*|[0-9#?@*$!-])/.exec(
      s.slice(i)
    )
    if (!m) return i
    const name = m[1].replace(/^\{|\}$/g, "").replace(/[:#%/].*$/, "")
    w.vars.push({ name, followedBySlash: s[i + m[0].length] === "/" })
    w.text += m[0]
    w.raw += m[0]
    return i + m[0].length - 1
  }
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]
    if (ch === "\n") {
      op("\n")
      // Heredoc bodies start on the line after their `<<` operator.
      while (pending.length > 0) {
        const { delimiter, strip, segment } = pending.shift()
        const lines = []
        let j = i + 1
        for (;;) {
          const next = s.indexOf("\n", j)
          const line = s.slice(j, next === -1 ? s.length : next)
          const endLine = strip ? line.replace(/^\t+/, "") : line
          if (endLine.trim() === delimiter) {
            i = next === -1 ? s.length : next
            break
          }
          lines.push(line)
          if (next === -1) {
            i = s.length
            break
          }
          j = next + 1
        }
        heredocs.push({ segment, body: lines.join("\n") })
      }
      continue
    }
    if (ch === " " || ch === "\t") {
      end()
      continue
    }
    if (ch === "#" && !word) {
      // A comment runs to the end of the line.
      const next = s.indexOf("\n", i)
      i = (next === -1 ? s.length : next) - 1
      continue
    }
    if (ch === "\\") {
      start()
      word.text += s[i + 1] ?? ""
      word.raw += ch + (s[i + 1] ?? "")
      i += 1
      continue
    }
    if (ch === "'") {
      const close = s.indexOf("'", i + 1)
      const body = s.slice(i + 1, close === -1 ? s.length : close)
      start()
      word.text += body
      word.raw += `'${body}'`
      word.quoted = true
      i = close === -1 ? s.length : close
      continue
    }
    if (ch === '"') {
      start()
      word.quoted = true
      let j = i + 1
      for (; j < s.length && s[j] !== '"'; j += 1) {
        if (s[j] === "\\") {
          word.text += s[j + 1] ?? ""
          j += 1
        } else if (s[j] === "$" && s[j + 1] === "(") {
          const [body, next] = readParen(s, j + 2)
          word.subs.push({ body, followedBySlash: s[next] === "/" })
          word.text += `$(${body})`
          j = next - 1
        } else if (s[j] === "`") {
          const close = s.indexOf("`", j + 1)
          const body = s.slice(j + 1, close === -1 ? s.length : close)
          word.subs.push({ body, followedBySlash: s[close + 1] === "/" })
          word.text += `\`${body}\``
          j = close === -1 ? s.length : close
        } else if (s[j] === "$") {
          j = readVar(j, word)
        } else word.text += s[j]
      }
      word.raw += s.slice(i, j + 1)
      i = j
      continue
    }
    if (ch === "$" && s[i + 1] === "(") {
      const [body, next] = readParen(s, i + 2)
      start()
      word.subs.push({ body, followedBySlash: s[next] === "/" })
      word.text += `$(${body})`
      word.raw += `$(${body})`
      i = next - 1
      continue
    }
    if (ch === "`") {
      const close = s.indexOf("`", i + 1)
      const body = s.slice(i + 1, close === -1 ? s.length : close)
      start()
      word.subs.push({ body, followedBySlash: s[close + 1] === "/" })
      word.text += `\`${body}\``
      word.raw += `\`${body}\``
      i = close === -1 ? s.length : close
      continue
    }
    if (ch === "$") {
      start()
      i = readVar(i, word)
      continue
    }
    if (ch === "<" && s[i + 1] === "<" && s[i + 2] !== "<") {
      const m = /^<<(-?)\s*(['"]?)([A-Za-z_][\w-]*)\2/.exec(s.slice(i))
      if (m) {
        end()
        const segment = tokens.filter(
          (t) => t.type === "op" && t.text !== "redir"
        ).length
        pending.push({ delimiter: m[3], strip: m[1] === "-", segment })
        i += m[0].length - 1
        continue
      }
    }
    if (ch === "<" && s.slice(i, i + 3) === "<<<") {
      op("herestring")
      i += 2
      continue
    }
    if (ch === ">" || ch === "<") {
      // A leading fd number (`2>`) belongs to the redirection.
      if (word && /^\d+$/.test(word.text) && !word.quoted) word = null
      end()
      // `out`: the target is written (`>`, `>>`, not `>&` / `<`).
      const out = ch === ">" && s[i + 1] !== "&"
      const append = ch === ">" && s[i + 1] === ">"
      if (s[i + 1] === ">" || s[i + 1] === "&") i += 1
      tokens.push({ type: "op", text: "redir", out, append })
      continue
    }
    if (ch === "&" || ch === "|" || ch === ";" || ch === "(" || ch === ")") {
      const two = s.slice(i, i + 2)
      if (two === "&&" || two === "||") {
        op(two)
        i += 1
      } else if (ch === "&" && s[i + 1] === ">") {
        end()
        tokens.push({ type: "op", text: "redir", out: true, append: false })
        i += 1
      } else op(ch)
      continue
    }
    start()
    word.text += ch
    word.raw += ch
  }
  end()
  return { tokens, heredocs }
}

/**
 * Splits tokens into simple commands:
 * { words, redirects, outputs, herestrings, piped }. `outputs` are the
 * redirection targets written to (`{ word, append }`); `piped` says the
 * command reads the previous one's output.
 */
function segmentsOf(tokens) {
  const segment = (piped) => ({
    words: [],
    redirects: [],
    outputs: [],
    herestrings: [],
    piped,
  })
  const segments = [segment(false)]
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i]
    const seg = segments[segments.length - 1]
    if (t.type === "op" && t.text === "redir") {
      const target = tokens[i + 1]
      if (target?.type === "word") {
        seg.redirects.push(target)
        if (t.out) seg.outputs.push({ word: target, append: t.append })
        i += 1
      }
    } else if (t.type === "op" && t.text === "herestring") {
      const body = tokens[i + 1]
      if (body?.type === "word") {
        seg.herestrings.push(body)
        i += 1
      }
    } else if (t.type === "op") {
      segments.push(segment(t.text === "|"))
    } else seg.words.push(t)
  }
  return segments
}

// ---------------------------------------------------------------- checks

/** String literals in code that point at user data or climb out. */
function scanCode(code, cwd, check, { relative }) {
  for (const m of code.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
    const literal = m[2].replace(/\$\{[^}]*\}/g, "")
    if (!literal) continue
    const absolute = USER_DATA_ROOT.test(literal)
    const home = /^~($|\/|[A-Za-z_])/.test(literal)
    const climbs = relative && /(^|\/)\.\.(\/|$)/.test(literal)
    if (absolute || home || climbs) {
      check(literal, cwd, "path in interpreted code")
    }
  }
}

// ---------------------------------------------------------------- network

/** `localhost`, `*.localhost`, `127.*`, `[::1]`, `0.0.0.0`. */
const isLocalHost = (host) =>
  /^(localhost|.+\.localhost|127\.\d+\.\d+\.\d+|\[::1?\]|0\.0\.0\.0)$/i.test(
    host
  )

/**
 * The URLs in a text, each with its host. A host the text builds
 * (`${host}`, `$HOST`, empty) is not local: it cannot be resolved.
 */
function urlsIn(text) {
  return [...text.matchAll(URLS)].map((m) => {
    const authority = m[1].replace(/^[^@]*@/, "")
    const host = authority.startsWith("[")
      ? authority.slice(0, authority.indexOf("]") + 1)
      : authority.split(":")[0]
    return { url: m[0], local: isLocalHost(host) }
  })
}

/**
 * Code split into its string literals and a skeleton in which each literal is
 * `"S<n>"`: '…', "…" (to the end of the line at most), `…` and Python's
 * triple quotes. The skeleton is what the code does; the literals are data.
 */
function splitCode(code) {
  const literals = []
  let skeleton = ""
  for (let i = 0; i < code.length; i += 1) {
    const ch = code[i]
    const triple = code.slice(i, i + 3)
    if (triple === "'''" || triple === '"""') {
      const close = code.indexOf(triple, i + 3)
      literals.push(code.slice(i + 3, close === -1 ? code.length : close))
      skeleton += `"S${literals.length - 1}"`
      i = close === -1 ? code.length : close + 2
      continue
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      let j = i + 1
      for (; j < code.length && code[j] !== ch; j += 1) {
        if (code[j] === "\\") j += 1
        else if (code[j] === "\n" && ch !== "`") break
      }
      literals.push(code.slice(i + 1, j))
      skeleton += `"S${literals.length - 1}"` + (code[j] === "\n" ? "\n" : "")
      i = j
      continue
    }
    skeleton += ch
  }
  // Comments are prose: `/* … */`, `// …` and `# …` (a `#` after a space).
  skeleton = skeleton
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[\s;{}()])\/\/.*$/gm, "$1")
    .replace(/(^|\s)#.*$/gm, "$1")
  return { skeleton, literals }
}

/**
 * Network use in interpreter code: a network call towards a non-local host,
 * or towards no host the code names (it builds or receives it); and network
 * commands it runs through child_process / subprocess (`shellNet` scans a
 * string literal as a command). Code that names only local hosts is clean.
 */
function networkInCode(code, shellNet) {
  const { skeleton, literals } = splitCode(code)
  const modules = [...skeleton.matchAll(MODULE_SPECIFIERS)].map(
    (m) => literals[Number(m[1] ?? m[2] ?? m[3])] ?? ""
  )
  const found = []
  if (SPAWN_CALLS.test(skeleton) || modules.some((m) => SPAWN_MODULES.test(m)))
    for (const literal of literals) found.push(...shellNet(literal))
  const call =
    NETWORK_CALLS.exec(skeleton)?.[0] ??
    modules.find((m) => NETWORK_MODULES.test(m))
  if (call === undefined) return found
  const urls = literals.flatMap(urlsIn)
  if (urls.length === 0) {
    found.push({
      value: call,
      reason: "network call in interpreted code to a host it does not name",
      network: true,
    })
  }
  for (const u of urls) {
    if (!u.local) {
      found.push({
        value: u.url,
        reason: "network call in interpreted code to a non-local host",
        network: true,
      })
    }
  }
  return found
}

/** The words from the command name on: assignments and wrappers skipped. */
function commandOf(words) {
  let k = 0
  for (;;) {
    while (k < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[k].text))
      k += 1
    if (k >= words.length || !WRAPPERS.has(basename(words[k].text)))
      return words.slice(k)
    k += 1
    // The wrapper's options, assignments (`env`) and durations (`timeout`).
    while (
      k < words.length &&
      /^(-|[A-Za-z_][A-Za-z0-9_]*=|\d+(\.\d+)?[smhd]?$)/.test(words[k].text)
    )
      k += 1
  }
}

/** Whether a package runner's arguments name a package the run lacks. */
function runsRemotePackage(args) {
  if (args.some((a) => ["--no-install", "--no", "--offline"].includes(a)))
    return false
  const packages = []
  for (let j = 0; j < args.length; j += 1) {
    const a = args[j]
    if (a === "-p" || a === "--package") {
      if (args[j + 1]) packages.push(args[j + 1])
      j += 1
    } else if (a.startsWith("--package=")) packages.push(a.slice(10))
    else if (!a.startsWith("-")) {
      if (packages.length === 0) packages.push(a)
      break
    }
  }
  return packages.some((p) => !LOCAL_PACKAGES.has(p) && !/^[./]/.test(p))
}

/**
 * Network use by a simple command itself: a network command, a package
 * manager or git reaching a remote, a URL of a non-local host given to an
 * interpreter. (Interpreter code is judged by `networkInCode`.)
 */
function networkCommand(words) {
  const cmd = commandOf(words)
  if (cmd.length === 0) return []
  const name = basename(cmd[0].text)
  const args = cmd.slice(1).map((w) => w.text)
  const hit = (reason) => [
    {
      value: cmd
        .map((w) => w.text)
        .join(" ")
        .slice(0, 200),
      reason,
      network: true,
    },
  ]
  const sub = args.find((a) => !a.startsWith("-"))
  if (NETWORK_COMMANDS.has(name)) return hit("network command")
  if (
    name === "rsync" &&
    args.some((a) => /^(rsync:\/\/|[\w.-]+(@[\w.-]+)?::?)/.test(a))
  )
    return hit("network command")
  if (PACKAGE_RUNNERS.has(name) || name === "uvx" || name === "pipx") {
    return name === "uvx" || name === "pipx" || runsRemotePackage(args)
      ? hit("package runner that installs from the registry")
      : []
  }
  if (PACKAGE_MANAGERS.has(name)) {
    if (args.includes("--offline")) return []
    const rest = args.slice(args.indexOf(sub) + 1)
    if (name === "yarn" && sub === undefined)
      return hit("package manager command that reaches the registry")
    if (PACKAGE_RUN_SUBCOMMANDS[name].has(sub)) {
      return runsRemotePackage(rest)
        ? hit("package runner that installs from the registry")
        : []
    }
    if (
      REGISTRY_SUBCOMMANDS.has(sub) ||
      (sub === "init" && rest.some((a) => !a.startsWith("-")))
    )
      return hit("package manager command that reaches the registry")
  }
  if ((name === "pip" || name === "pip3") && PIP_REMOTE.has(sub))
    return hit("package manager command that reaches the registry")
  if (name === "git") {
    let j = 0
    while (j < args.length && args[j].startsWith("-")) {
      if (args[j] === "-C" || args[j] === "-c") j += 1
      j += 1
    }
    if (
      GIT_REMOTE.has(args[j]) ||
      (args[j] === "remote" && args.slice(j + 1).includes("update"))
    )
      return hit("git command that reaches a remote")
  }
  if (INTERPRETERS.has(name)) {
    const found = []
    for (let j = 0; j < args.length; j += 1) {
      const a = args[j]
      if (a === "-m" && /^pip3?$/.test(args[j + 1] ?? "")) {
        return PIP_REMOTE.has(args[j + 2])
          ? hit("package manager command that reaches the registry")
          : []
      }
      // Code (`-e …`, `--eval=…`) is judged by networkInCode.
      if (CODE_FLAGS.has(a)) j += 1
      else if (/^--(eval|print)=/.test(a)) continue
      else {
        for (const u of urlsIn(a).filter((u) => !u.local)) {
          found.push({
            value: u.url,
            reason: "URL of a non-local host given to an interpreter",
            network: true,
          })
        }
      }
    }
    return found
  }
  return []
}

/** The words of a simple command that are paths, by command. */
function pathWords(words) {
  let k = 0
  // Leading `NAME=value` assignments: their values are paths too.
  const out = []
  while (k < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[k].text)) {
    out.push({ ...words[k], text: words[k].text.replace(/^[^=]*=/, "") })
    k += 1
  }
  const rest = words.slice(k)
  if (rest.length === 0) return { kind: "plain", paths: out }
  const cmd = basename(rest[0].text)
  const args = rest.slice(1)
  if (cmd === "cd") return { kind: "cd", target: args[0], paths: out }
  if (cmd === "xargs") {
    let j = 0
    while (j < args.length && args[j].text.startsWith("-")) j += 1
    return { kind: "nested", words: args.slice(j), paths: out }
  }
  if (SHELLS.has(cmd)) {
    const c = args.findIndex((a) => a.text === "-c")
    if (c !== -1 && args[c + 1])
      return { kind: "shell", script: args[c + 1].text, paths: out }
    return {
      kind: "plain",
      paths: [...out, ...args.filter((a) => !a.text.startsWith("-"))],
    }
  }
  if (
    INTERPRETERS.has(cmd) ||
    (cmd === "npx" && INTERPRETERS.has(basename(args[0]?.text ?? "")))
  ) {
    const code = []
    const paths = [...out]
    for (let j = 0; j < args.length; j += 1) {
      const a = args[j].text
      if (CODE_FLAGS.has(a) && args[j + 1]) {
        code.push(args[j + 1].text)
        j += 1
      } else if (/^--(eval|print)=/.test(a)) code.push(a.replace(/^[^=]*=/, ""))
      else if (!a.startsWith("-")) paths.push(args[j])
    }
    return { kind: "interpreter", code, paths }
  }
  if (PATTERN_COMMANDS.has(cmd)) {
    const paths = [...out]
    let patternSeen = false
    for (let j = 0; j < args.length; j += 1) {
      const a = args[j].text
      if (a === "-e" || a === "--regexp" || a === "--expression") {
        patternSeen = true
        j += 1
      } else if (a === "-f" || a === "--file") {
        if (args[j + 1]) paths.push(args[j + 1])
        j += 1
      } else if (cmd.endsWith("awk") && a === "-v") {
        j += 1
      } else if (a.startsWith("-")) {
        // an option (its numeric value, if any, is not path-like)
      } else if (!patternSeen) patternSeen = true
      else paths.push(args[j])
    }
    return { kind: "plain", paths }
  }
  return { kind: "plain", paths: [...out, ...args] }
}

/** Checks one shell word in a path position. */
function checkWord(word, cwd, check, flag, scanShell) {
  for (const sub of word.subs) {
    scanShell(sub.body, cwd)
    if (PATHY_SUBST.test(sub.body) || sub.followedBySlash) {
      flag({
        value: `$(${sub.body})`,
        reason: "command substitution in a path",
      })
    }
  }
  for (const v of word.vars) {
    if (OUTSIDE_VARS.has(v.name)) {
      flag({
        value: `$${v.name}`,
        reason: `$${v.name} points outside the run directory`,
      })
    } else if (v.name !== "HOME" && v.name !== "PWD" && v.followedBySlash) {
      flag({ value: `$${v.name}`, reason: "unresolved variable in a path" })
    }
  }
  const text = word.text
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return // a URL
  for (const part of text.split(/[=:,]/)) {
    if (!part || part.startsWith("//")) continue
    if (/\$\(|`/.test(part)) continue // reported as a substitution
    if (/\$\{?(?!HOME\b|PWD\b)[A-Za-z_]/.test(part)) continue // reported as a variable
    const pathy =
      part.includes("/") ||
      part === ".." ||
      part.startsWith("~") ||
      /\$\{?(HOME|PWD)\b/.test(part)
    if (!pathy) continue
    // Expand variables before cutting at a glob character (`${PWD}` has a `{`).
    const expanded = part
      .replace(/\$\{HOME\}|\$HOME\b/g, homedir())
      .replace(/\$\{PWD\}|\$PWD\b/g, cwd)
    check(globBase(expanded), cwd, "path outside the run directory", part)
  }
}

/**
 * Scans a shell command, starting in `cwd`; returns the cwd it leaves.
 * `check(path, cwd, reason, shown?)` records a violation when `path`
 * resolves outside; `flag(v)` records one that cannot be resolved, and
 * network use. `written` maps each file the run has written (Write, Edit, a
 * heredoc or echo into a file) to its text, so that a script written in the
 * run and then run is judged as code; this command's writes are added to it.
 */
function scanShell(
  command,
  startCwd,
  allowed,
  check,
  flag,
  written = new Map()
) {
  let cwd = startCwd
  const { tokens, heredocs } = lexShell(command)
  const segments = segmentsOf(tokens)
  const recurse = (body, at) =>
    scanShell(body, at, allowed, check, flag, written)
  // Network use only, in text that runs as commands (a string given to
  // child_process, a shell script written in the run): its words are not
  // judged as paths here.
  const networkOnly = (body, at) => {
    const found = []
    scanShell(
      body,
      at,
      allowed,
      () => {},
      (v) => v.network && found.push(v),
      new Map(written)
    )
    return found
  }
  const codeNetwork = (code, at, script) => {
    for (const v of networkInCode(code, (text) => networkOnly(text, at))) {
      flag(
        script === undefined
          ? v
          : {
              ...v,
              value: `${script}: ${v.value}`,
              reason: `${v.reason} (a script written in this run)`,
            }
      )
    }
  }
  const writtenText = (word, at) => written.get(fileKey(expand(word.text, at)))
  // What the previous command printed, when the scan knows it (an echo, a
  // heredoc through cat, a cat of a file the run wrote): input to a pipe.
  let printed
  segments.forEach((seg, index) => {
    const role = pathWords(seg.words)
    const stdin = seg.piped ? printed : undefined
    printed = undefined
    if (role.kind === "cd") {
      const target = role.target
      if (
        target &&
        (target.subs.length > 0 ||
          target.vars.some((v) => v.name !== "HOME" && v.name !== "PWD"))
      ) {
        checkWord(target, cwd, check, flag, recurse)
        return
      }
      const next = expand(target?.text ?? "~", cwd)
      if (!inside(next, allowed)) {
        flag({
          value: `cd ${target?.text ?? ""}`.trim(),
          resolved: next,
          reason: "cd out of the run directory",
        })
      }
      cwd = next
      return
    }
    if (seg.words.length > 0 && !inside(cwd, allowed)) {
      flag({
        value: seg.words
          .map((w) => w.text)
          .join(" ")
          .slice(0, 200),
        resolved: cwd,
        reason: "command runs outside the run directory",
      })
    }
    for (const w of role.paths) checkWord(w, cwd, check, flag, recurse)
    for (const w of seg.redirects) checkWord(w, cwd, check, flag, recurse)
    for (const v of networkCommand(seg.words)) flag(v)
    if (role.kind === "nested") {
      const nested = pathWords(role.words)
      for (const w of nested.paths) checkWord(w, cwd, check, flag, recurse)
      for (const v of networkCommand(role.words)) flag(v)
      if (nested.kind === "interpreter") {
        for (const code of nested.code) {
          scanCode(code, cwd, check, { relative: true })
          codeNetwork(code, cwd)
        }
      }
      if (nested.kind === "shell") {
        for (const v of networkOnly(nested.script, cwd)) flag(v)
      }
    }
    if (role.kind === "shell") recurse(role.script, cwd)
    if (role.kind === "interpreter") {
      for (const code of role.code)
        scanCode(code, cwd, check, { relative: true })
    }
    // Network use by code: judged on the command behind any wrapper
    // (`env node -e …`). A script the run wrote and runs now is code too, and
    // so is text piped into an interpreter or a shell.
    const command = commandOf(seg.words)
    const cmd = basename(command[0]?.text ?? "")
    const run = pathWords(command)
    if (run.kind === "interpreter") {
      for (const code of run.code) codeNetwork(code, cwd)
      for (const w of run.paths) {
        const text = writtenText(w, cwd)
        if (text !== undefined) codeNetwork(text, cwd, w.text)
      }
      if (stdin !== undefined && run.code.length === 0) codeNetwork(stdin, cwd)
    }
    if (run.kind === "shell") {
      for (const v of networkOnly(run.script, cwd)) {
        if (role.kind !== "shell") flag(v) // else `recurse` above found it
      }
    }
    if (SHELLS.has(cmd) && run.kind === "plain") {
      const scripts = run.paths
        .map((w) => [w.text, writtenText(w, cwd)])
        .filter(([, text]) => text !== undefined)
      if (stdin !== undefined) scripts.push(["(stdin)", stdin])
      for (const [name, text] of scripts) {
        for (const v of networkOnly(text, cwd))
          flag({ ...v, value: `${name}: ${v.value}` })
      }
    }
    // Here-strings and heredocs: fed to a shell they are shell, fed to an
    // interpreter they are code, otherwise they are data being written.
    const fed = [
      ...seg.herestrings.map((w) => w.text),
      ...heredocs.filter((h) => h.segment === index).map((h) => h.body),
    ]
    const fedTo = basename(
      seg.words.find((w) => !/^[A-Za-z_]\w*=/.test(w.text))?.text ?? ""
    )
    for (const body of fed) {
      if (SHELLS.has(fedTo)) recurse(body, cwd)
      else if (INTERPRETERS.has(fedTo))
        scanCode(body, cwd, check, { relative: true })
      else scanCode(body, cwd, check, { relative: false })
      // `cmd` sees through wrappers (`env node <<EOF`); paths keep `fedTo`.
      if (INTERPRETERS.has(cmd)) codeNetwork(body, cwd)
      else if (SHELLS.has(cmd) && !SHELLS.has(fedTo)) {
        for (const v of networkOnly(body, cwd)) flag(v)
      }
    }
    // What this command prints, and the files it writes with it.
    const args = command.slice(1)
    if (cmd === "echo" || cmd === "printf") {
      printed = args
        .filter((w) => !w.text.startsWith("-"))
        .map((w) => w.text)
        .join(" ")
    } else if (cmd === "cat" || cmd === "tee" || cmd === "") {
      const input =
        fed.length > 0
          ? fed.join("\n")
          : cmd === "cat"
            ? args.map((w) => writtenText(w, cwd)).find((t) => t !== undefined)
            : stdin
      printed = input
      if (cmd === "tee" && input !== undefined) {
        for (const w of args.filter((w) => !w.text.startsWith("-")))
          written.set(fileKey(expand(w.text, cwd)), input)
      }
    }
    for (const { word, append } of seg.outputs) {
      const path = fileKey(expand(word.text, cwd))
      if (printed === undefined) written.delete(path)
      else
        written.set(
          path,
          append ? `${written.get(path) ?? ""}${printed}\n` : `${printed}\n`
        )
    }
    if (seg.outputs.length > 0) printed = undefined
  })
  return cwd
}

/** Applies an Edit (or one edit of a MultiEdit) to a file the run wrote. */
function applyEdit(written, path, edit) {
  if (typeof edit?.new_string !== "string") return
  const before = written.get(path)
  const old = edit.old_string
  if (
    before !== undefined &&
    typeof old === "string" &&
    old !== "" &&
    before.includes(old)
  ) {
    written.set(
      path,
      edit.replace_all
        ? before.split(old).join(edit.new_string)
        : before.replace(old, () => edit.new_string)
    )
  } else {
    // A file the scan has not seen whole (one of the starter's): keep what
    // was put into it.
    written.set(path, `${before ?? ""}\n${edit.new_string}`)
  }
}

// ---------------------------------------------------------------- transcripts

/**
 * Every tool_use and tool_result block, in transcript order, with the speaker
 * of the message it is in: "assistant" if any enclosing object is an
 * assistant message (`type` or `role` "assistant"), else "user" if one is a
 * user message, else undefined.
 */
function* toolBlocks(value, speaker) {
  if (Array.isArray(value)) {
    for (const item of value) yield* toolBlocks(item, speaker)
  } else if (value && typeof value === "object") {
    const own = [value.type, value.role].find(
      (s) => s === "assistant" || s === "user"
    )
    if (own && speaker !== "assistant") speaker = own
    if (value.type === "tool_use" || value.type === "tool_result")
      yield { block: value, speaker }
    for (const child of Object.values(value)) yield* toolBlocks(child, speaker)
  }
}

/** The path a tool_result's whole content names as the CLI's notice. */
function persistedNotice(result) {
  const content = result.content
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content) &&
          content.length === 1 &&
          content[0]?.type === "text" &&
          typeof content[0].text === "string"
        ? content[0].text
        : undefined
  const match = text === undefined ? null : PERSISTED_NOTICE.exec(text)
  if (!match) return undefined
  const path = match[1]
  return isAbsolute(path) && resolve(path) === path ? path : undefined
}

/** `<run>` for a run directory `<run>/work`, in each spelling roots() has. */
function runRoots(runDir) {
  const work = [resolve(runDir), realpathOrSelf(resolve(runDir))]
  return [...new Set(work.filter((w) => basename(w) === "work").map(dirname))]
}

function parseTranscript(text) {
  const docs = []
  const trimmed = text.trim()
  if (trimmed.startsWith("[")) {
    try {
      docs.push(JSON.parse(trimmed))
      return docs
    } catch {
      // fall through to line-by-line
    }
  }
  for (const line of text.split("\n")) {
    const l = line.trim()
    if (!l.startsWith("{") && !l.startsWith("[")) continue
    try {
      docs.push(JSON.parse(l))
    } catch {
      // a partial or non-JSON line
    }
  }
  return docs
}

const resultText = (result) =>
  typeof result.content === "string"
    ? result.content
    : JSON.stringify(result.content ?? "")

/** The run directory a transcript's init message names, if any. */
export function transcriptCwd(transcript) {
  for (const doc of parseTranscript(transcript)) {
    if (
      doc?.type === "system" &&
      doc.subtype === "init" &&
      typeof doc.cwd === "string"
    ) {
      return doc.cwd
    }
  }
  return undefined
}

/**
 * @param {string} transcript the agent's stdout
 * @param {{ runDir: string }} options
 * @returns {{ contaminated: boolean, auditable: boolean, toolCalls: number,
 *   attempts: number, violations: Array<{ tool: string, value: string,
 *   resolved?: string, reason: string, blocked: boolean }>,
 *   persistedReads: Array<{ tool: string, value: string }> }}
 *   `persistedReads` are the reads of the CLI's persisted output that were
 *   not counted as violations (header comment).
 */
export function scanTranscript(transcript, { runDir }) {
  const allowed = roots(runDir)
  const docs = parseTranscript(transcript)
  if (docs.length === 0) {
    return {
      contaminated: true,
      auditable: false,
      toolCalls: 0,
      attempts: 0,
      violations: [
        {
          tool: "-",
          value: "",
          reason: "transcript holds no JSON: cannot be audited",
          blocked: false,
        },
      ],
      persistedReads: [],
    }
  }
  const uses = []
  const results = new Map()
  // Transcript order of every block, and the CLI's persisted-output notices.
  const order = new Map()
  const notices = []
  for (const doc of docs) {
    for (const { block, speaker } of toolBlocks(doc)) {
      order.set(block, order.size)
      if (block.type === "tool_use" && typeof block.name === "string")
        uses.push(block)
      if (
        block.type === "tool_result" &&
        typeof block.tool_use_id === "string"
      ) {
        results.set(block.tool_use_id, block)
        const path = speaker === "user" ? persistedNotice(block) : undefined
        if (path !== undefined)
          notices.push({ path, at: order.get(block), id: block.tool_use_id })
      }
    }
  }
  const violations = []
  const persistedReads = []
  const written = new Map()
  const usesById = new Map()
  const cleanCalls = new Set()
  const homes = runRoots(runDir)
  /** A Read or Grep of the CLI's persisted output (header comment). */
  const persistedRead = (use, input, field) => {
    const raw = input[field]
    if (PERSISTED_READERS[use.name] !== field || raw.split("/").includes(".."))
      return false
    const path = expand(raw, resolve(runDir))
    const at = order.get(use)
    if (
      !homes.some((run) =>
        PERSISTED_PATH.test(
          path.startsWith(run + sep) ? path.slice(run.length + 1) : ""
        )
      ) ||
      (existsSync(path) && fileKey(realpathOrSelf(path)) !== fileKey(path))
    )
      return false
    return notices.some((notice) => {
      const producer = usesById.get(notice.id)
      return (
        notice.path === path &&
        notice.at < at &&
        producer !== undefined &&
        order.get(producer) < notice.at &&
        producer.name !== "Read" &&
        cleanCalls.has(producer)
      )
    })
  }
  let shellCwd = resolve(runDir)
  for (const use of uses) {
    if (typeof use.id === "string" && !usesById.has(use.id))
      usesById.set(use.id, use)
    const found = []
    const input = use.input && typeof use.input === "object" ? use.input : {}
    const flag = (v) => found.push(v)
    const check = (value, cwd, reason, shown = value) => {
      if (SAFE.has(value)) return
      const resolved = expand(value, cwd)
      if (SAFE.has(resolved) || inside(resolved, allowed)) return
      found.push({ value: shown, resolved, reason })
    }
    if (NETWORK_TOOLS.has(use.name)) {
      found.push({
        value: JSON.stringify(input).slice(0, 200),
        reason: "network tool",
      })
    }
    for (const field of PATH_FIELDS) {
      if (typeof input[field] === "string" && input[field] !== "") {
        if (persistedRead(use, input, field)) {
          persistedReads.push({ tool: use.name, value: input[field] })
          continue
        }
        check(
          input[field],
          resolve(runDir),
          `${field} outside the run directory`
        )
      }
    }
    if (use.name === "Glob" && typeof input.pattern === "string") {
      check(
        globBase(input.pattern),
        resolve(runDir),
        "pattern outside the run directory"
      )
    }
    if (use.name === "Grep" && typeof input.glob === "string") {
      check(
        globBase(input.glob),
        resolve(runDir),
        "glob outside the run directory"
      )
    }
    if (typeof input.command === "string") {
      shellCwd = scanShell(
        input.command,
        shellCwd,
        allowed,
        check,
        flag,
        written
      )
    }
    // What the file tools write, for a script run later (scanShell).
    if (typeof input.file_path === "string" && input.file_path !== "") {
      const path = fileKey(expand(input.file_path, resolve(runDir)))
      if (use.name === "Write" && typeof input.content === "string")
        written.set(path, input.content)
      else if (use.name === "Edit") applyEdit(written, path, input)
      else if (use.name === "MultiEdit" && Array.isArray(input.edits)) {
        for (const edit of input.edits) applyEdit(written, path, edit)
      }
    }
    if (found.length === 0) {
      cleanCalls.add(use)
      continue
    }
    const result = results.get(use.id)
    const text = result === undefined ? "" : resultText(result)
    const refusals = text.split("\n").filter((line) => PERMISSION.test(line))
    for (const v of found) {
      const named = refusals.some(
        (line) =>
          (v.value && line.includes(v.value)) ||
          (v.resolved && line.includes(v.resolved))
      )
      const blocked =
        result !== undefined &&
        (result.is_error === true ||
          named ||
          (found.length === 1 && refusals.length > 0))
      violations.push({ tool: use.name, ...v, blocked })
    }
  }
  return {
    contaminated: violations.some((v) => !v.blocked),
    auditable: true,
    toolCalls: uses.length,
    attempts: violations.length,
    violations,
    persistedReads,
  }
}
