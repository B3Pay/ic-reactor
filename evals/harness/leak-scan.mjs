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
// - uses a network tool (WebFetch, WebSearch).
// A violation is `blocked` when the call failed (`is_error`) or its output
// reports a permission refusal (`Operation not permitted`, `EPERM`, `EACCES`,
// `Permission denied`) naming that path — or, when it is the call's only
// violation, reports one at all. The run is contaminated when any violation
// was NOT blocked — a successful outside read — or when the transcript holds
// no parseable JSON (it cannot be audited). The run's own node_modules counts
// as inside, including the target of a node_modules symlink.
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
      if (s[i + 1] === ">" || s[i + 1] === "&") i += 1
      tokens.push({ type: "op", text: "redir" })
      continue
    }
    if (ch === "&" || ch === "|" || ch === ";" || ch === "(" || ch === ")") {
      const two = s.slice(i, i + 2)
      if (two === "&&" || two === "||") {
        op(two)
        i += 1
      } else if (ch === "&" && s[i + 1] === ">") {
        end()
        tokens.push({ type: "op", text: "redir" })
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

/** Splits tokens into simple commands: { words, redirects, herestrings }. */
function segmentsOf(tokens) {
  const segments = [{ words: [], redirects: [], herestrings: [] }]
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i]
    const seg = segments[segments.length - 1]
    if (t.type === "op" && t.text === "redir") {
      const target = tokens[i + 1]
      if (target?.type === "word") {
        seg.redirects.push(target)
        i += 1
      }
    } else if (t.type === "op" && t.text === "herestring") {
      const body = tokens[i + 1]
      if (body?.type === "word") {
        seg.herestrings.push(body)
        i += 1
      }
    } else if (t.type === "op") {
      segments.push({ words: [], redirects: [], herestrings: [] })
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
 * resolves outside; `flag(v)` records one that cannot be resolved.
 */
function scanShell(command, startCwd, allowed, check, flag) {
  let cwd = startCwd
  const { tokens, heredocs } = lexShell(command)
  const segments = segmentsOf(tokens)
  const recurse = (body, at) => scanShell(body, at, allowed, check, flag)
  segments.forEach((seg, index) => {
    const role = pathWords(seg.words)
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
    if (role.kind === "nested") {
      const nested = pathWords(role.words)
      for (const w of nested.paths) checkWord(w, cwd, check, flag, recurse)
      if (nested.kind === "interpreter") {
        for (const code of nested.code)
          scanCode(code, cwd, check, { relative: true })
      }
    }
    if (role.kind === "shell") recurse(role.script, cwd)
    if (role.kind === "interpreter") {
      for (const code of role.code)
        scanCode(code, cwd, check, { relative: true })
    }
    // Here-strings and heredocs: fed to a shell they are shell, fed to an
    // interpreter they are code, otherwise they are data being written.
    const fed = [
      ...seg.herestrings.map((w) => w.text),
      ...heredocs.filter((h) => h.segment === index).map((h) => h.body),
    ]
    for (const body of fed) {
      const cmd = basename(
        seg.words.find((w) => !/^[A-Za-z_]\w*=/.test(w.text))?.text ?? ""
      )
      if (SHELLS.has(cmd)) recurse(body, cwd)
      else if (INTERPRETERS.has(cmd))
        scanCode(body, cwd, check, { relative: true })
      else scanCode(body, cwd, check, { relative: false })
    }
  })
  return cwd
}

// ---------------------------------------------------------------- transcripts

function* toolBlocks(value) {
  if (Array.isArray(value)) {
    for (const item of value) yield* toolBlocks(item)
  } else if (value && typeof value === "object") {
    if (value.type === "tool_use" || value.type === "tool_result") yield value
    for (const child of Object.values(value)) yield* toolBlocks(child)
  }
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
 *   resolved?: string, reason: string, blocked: boolean }> }}
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
    }
  }
  const uses = []
  const results = new Map()
  for (const doc of docs) {
    for (const block of toolBlocks(doc)) {
      if (block.type === "tool_use" && typeof block.name === "string")
        uses.push(block)
      if (
        block.type === "tool_result" &&
        typeof block.tool_use_id === "string"
      ) {
        results.set(block.tool_use_id, block)
      }
    }
  }
  const violations = []
  let shellCwd = resolve(runDir)
  for (const use of uses) {
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
      shellCwd = scanShell(input.command, shellCwd, allowed, check, flag)
    }
    if (found.length === 0) continue
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
  }
}
