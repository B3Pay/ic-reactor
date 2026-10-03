// The command line: `node:util`'s parseArgs, one table of flags, and which
// command takes which. No CLI framework: an agent reads the usage text below,
// and a flag a command does not take is refused, never ignored.
import { parseArgs } from "node:util"
import { UsageError } from "./input.ts"

const FLAGS = {
  network: { type: "string" },
  "root-key": { type: "string" },
  ledger: { type: "string" },
  pem: { type: "string" },
  json: { type: "boolean" },
  help: { type: "boolean", short: "h" },
  certified: { type: "boolean" },
  subaccount: { type: "string" },
  "to-subaccount": { type: "string" },
  "from-subaccount": { type: "string" },
  memo: { type: "string" },
  fee: { type: "string" },
  "created-at-time": { type: "string" },
  "resend-unknown": { type: "boolean" },
  interval: { type: "string" },
} as const

export type Flag = keyof typeof FLAGS

/** The values of the flags given; absent ones are missing. */
export type Flags = {
  readonly [F in Flag]?: (typeof FLAGS)[F]["type"] extends "string"
    ? string
    : boolean
}

/** The flags every command but `demo` takes. */
const GLOBAL: readonly Flag[] = ["network", "root-key", "ledger", "pem", "json"]

/** Each command: its positional arguments and its own flags. */
export const COMMANDS = {
  whoami: { args: [], flags: [...GLOBAL] },
  info: { args: [], flags: [...GLOBAL, "certified"] },
  balance: {
    args: ["principal"],
    flags: [...GLOBAL, "subaccount", "certified"],
  },
  transfer: {
    args: ["to", "amount"],
    flags: [
      ...GLOBAL,
      "to-subaccount",
      "from-subaccount",
      "memo",
      "fee",
      "created-at-time",
      "resend-unknown",
    ],
  },
  watch: { args: ["principal"], flags: [...GLOBAL, "subaccount", "interval"] },
  demo: { args: [], flags: ["json"] },
} as const satisfies Record<
  string,
  { args: readonly string[]; flags: readonly Flag[] }
>

export type CommandName = keyof typeof COMMANDS

/** A parsed command line. */
export type CommandLine =
  | { readonly help: true; readonly json: boolean }
  | {
      readonly help: false
      readonly command: CommandName
      readonly args: readonly string[]
      readonly flags: Flags
      readonly json: boolean
    }

export const USAGE = `node-agent-tool: read and send ICRC-1 tokens from a terminal or an AI agent,
on @ic-reactor/core.

Usage: node src/cli.ts <command> [arguments] [flags]

Commands
  whoami                    the principal calls are signed as
  info                      name, symbol, decimals, fee and total supply
  balance <principal>       an account's balance
  transfer <to> <amount>    send tokens; <amount> in tokens, such as 1.5
  watch <principal>         print an account's balance when it changes, until Ctrl-C
  demo                      every failure mode, on an in-memory replica (no network)

Flags of every command but demo
  --network ic|local|<url>  where the ledger runs (default: ic). A <url> that is
                            not this machine needs --root-key <hex>
  --ledger icp|ckbtc|cketh|<canister id>   which ICRC-1 ledger (default: icp)
  --pem <file>              sign as this Ed25519 or secp256k1 key; else the seed in
                            NODE_AGENT_TOOL_SEED; else anonymous, which only reads
  --json                    one JSON document per line on stdout (demo too)

  info, balance             --certified: read with replicated calls, certified replies
  balance, watch            --subaccount <hex>
  transfer                  --to-subaccount <hex>  --from-subaccount <hex>  --memo <hex>
                            --fee <amount>  --created-at-time <ns>  --resend-unknown
  watch                     --interval <ms> (default: 5000)

Exit codes: 0 ok, 1 unexpected, 2 usage, 3 invalid_args, 4 unauthenticated,
5 not_delivered, 6 outcome_unknown, 7 rejected, 8 invalid_reply, 9 canister_err,
10 cancelled.`

const isCommand = (text: string): text is CommandName =>
  Object.hasOwn(COMMANDS, text)

function parse(argv: readonly string[]): {
  values: Flags
  positionals: string[]
} {
  try {
    return parseArgs({
      args: [...argv],
      options: FLAGS,
      allowPositionals: true,
      strict: true,
    })
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error))
  }
}

/**
 * Parses `argv` (the arguments after `node src/cli.ts`).
 *
 * @throws UsageError for an unknown command or flag, a flag the command does
 * not take, or the wrong number of arguments.
 */
export function parseCommandLine(argv: readonly string[]): CommandLine {
  const { values: flags, positionals } = parse(argv)
  const json = flags.json === true
  if (flags.help === true) return { help: true, json }

  const [name, ...args] = positionals
  if (name === undefined) throw new UsageError("no command given")
  if (!isCommand(name)) {
    throw new UsageError(`unknown command ${JSON.stringify(name)}`)
  }

  const spec: { args: readonly string[]; flags: readonly Flag[] } =
    COMMANDS[name]
  for (const given of Object.keys(flags)) {
    if (!spec.flags.some((flag) => flag === given)) {
      throw new UsageError(`${name} does not take --${given}`, name)
    }
  }
  if (args.length !== spec.args.length) {
    const wanted = spec.args.map((arg) => `<${arg}>`).join(" ")
    throw new UsageError(
      `${name} takes ${spec.args.length === 0 ? "no arguments" : wanted}, got ${args.length}`,
      name
    )
  }
  return { help: false, command: name, args, flags, json }
}
