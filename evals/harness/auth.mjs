// How an agent run authenticates, and keeping the credential out of results.
//
// Three sources, in this order of precedence:
// 1. `--oauth-token-file <path>`: a file holding a Claude subscription token
//    (`claude setup-token`), trimmed. Refused if group- or world-readable.
// 2. CLAUDE_CODE_OAUTH_TOKEN in the driver's environment: the same kind of
//    token. It works for headless `claude -p` with no config directory (and
//    is not read in `--bare` mode, which the driver therefore never uses).
// 3. ANTHROPIC_API_KEY: API billing. The CLI prefers an API key over an OAuth
//    token when both are set, so the driver passes ONLY the chosen
//    credential: with a token available, the subscription is what gets used.
// A token from the file reaches the agent as CLAUDE_CODE_OAUTH_TOKEN. The
// value is never printed or recorded: everything the driver writes goes
// through `redact`, which removes every credential value it knows of — the
// environment's and any read from a file — wherever it appears (an agent can
// read its own environment and echo it into a transcript or a file).
import { readFileSync, statSync } from "node:fs"

export const AUTH_VARS = {
  oauth: "CLAUDE_CODE_OAUTH_TOKEN",
  api_key: "ANTHROPIC_API_KEY",
}

// Credential values read from files, so `redact` knows them too.
const registered = new Set()

/** Reads a token file, refusing one that anyone but its owner can read. */
export function readTokenFile(path) {
  const mode = statSync(path).mode
  if ((mode & 0o077) !== 0) {
    throw new Error(
      `${path} is readable or writable by group or others (mode ${(mode & 0o777).toString(8)}); ` +
        `run \`chmod 600 ${path}\``
    )
  }
  // A token has no whitespace; one copied from a terminal often carries the
  // line break the terminal wrapped it at, so drop all of it, not just the ends.
  const value = readFileSync(path, "utf8").replace(/\s+/g, "")
  if (value === "") throw new Error(`${path} is empty`)
  registered.add(value)
  return value
}

/**
 * `{ kind, name, value, source }` for the credential to use, or `undefined`.
 * `name` is the variable it is passed to the agent as.
 */
export function resolveAuth(env = process.env, { tokenFile } = {}) {
  if (tokenFile) {
    return {
      kind: "oauth",
      name: AUTH_VARS.oauth,
      value: readTokenFile(tokenFile),
      source: "file",
    }
  }
  for (const kind of ["oauth", "api_key"]) {
    const name = AUTH_VARS[kind]
    const value = env[name]
    if (typeof value === "string" && value.trim() !== "") {
      return { kind, name, value: value.trim(), source: "env" }
    }
  }
  return undefined
}

export const MISSING_AUTH_MESSAGE =
  "no agent credential: pass --oauth-token-file <path> or set " +
  "CLAUDE_CODE_OAUTH_TOKEN (a Claude subscription token; create one with " +
  "`claude setup-token`), or set ANTHROPIC_API_KEY (API billing). The agent " +
  "runs with a clean CLAUDE_CONFIG_DIR, so the host's login is not available to it."

/** Every credential value known (environment and files), longest first. */
export function secretsOf(env = process.env) {
  return [
    ...new Set([
      ...Object.values(AUTH_VARS).map((name) => env[name]),
      ...Object.values(AUTH_VARS).map((name) => env[name]?.trim()),
      ...registered,
    ]),
  ]
    .filter((v) => typeof v === "string" && v.length >= 8)
    .sort((a, b) => b.length - a.length)
}

/** `text` with every credential value replaced by a marker. */
export function redact(text, secrets = secretsOf()) {
  let out = String(text)
  for (const secret of secrets) out = out.split(secret).join("[REDACTED]")
  return out
}
