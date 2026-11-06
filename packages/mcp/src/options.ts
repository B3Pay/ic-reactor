// The command line, read once at start. Everything a person can get wrong is
// refused here, before the server answers its first request.
import { homedir } from "node:os"
import { parseArgs } from "node:util"
import { checkCanisterId } from "./interface/ids.ts"
import { networkFrom, type NetworkChoice } from "./network.ts"
import { UsageError } from "./usage.ts"

/** A canister named with `--canister`: it gets typed tools and takes updates. */
export interface ListedCanister {
  /** The name its tools start with, such as `ledger` in `ledger_icrc1_transfer`. */
  readonly name: string
  readonly id: string
}

export interface Options {
  readonly help: boolean
  readonly version: boolean
  readonly network: NetworkChoice
  readonly identityPath: string | undefined
  readonly canisters: readonly ListedCanister[]
  /** Canister id to the .did path given with `--did`. */
  readonly didFiles: ReadonlyMap<string, string>
}

/** A name is short and plain, so that `<name>_<method>` stays a valid tool name. */
const NAME = /^[A-Za-z0-9_]{1,20}$/

/**
 * The options of `argv` (without the node and script paths).
 *
 * @throws UsageError for anything the server cannot start with.
 */
export function parseOptions(
  argv: readonly string[],
  home: () => string = homedir
): Options {
  let values: {
    canister?: string[]
    did?: string[]
    identity?: string
    network?: string
    "root-key"?: string
    help?: boolean
    version?: boolean
  }
  try {
    ;({ values } = parseArgs({
      args: [...argv],
      options: {
        canister: { type: "string", multiple: true },
        did: { type: "string", multiple: true },
        identity: { type: "string" },
        network: { type: "string" },
        "root-key": { type: "string" },
        help: { type: "boolean" },
        version: { type: "boolean" },
      },
      strict: true,
      allowPositionals: false,
    }))
  } catch (error) {
    throw new UsageError(
      `${error instanceof Error ? error.message : String(error)} (see --help)`
    )
  }

  const network = networkFrom(values.network, values["root-key"])
  const canisters = listedCanisters(values.canister ?? [])
  return {
    help: values.help === true,
    version: values.version === true,
    network,
    identityPath:
      values.identity === undefined
        ? undefined
        : expandHome(values.identity, home),
    canisters,
    didFiles: didFiles(values.did ?? [], canisters, home),
  }
}

function listedCanisters(flags: readonly string[]): ListedCanister[] {
  const byName = new Map<string, ListedCanister>()
  const ids = new Set<string>()
  for (const flag of flags) {
    const equals = flag.indexOf("=")
    const idText = equals === -1 ? flag : flag.slice(equals + 1)
    const checked = checkCanisterId(idText.trim())
    if (!checked.ok)
      throw new UsageError(`--canister ${flag}: ${checked.message}`)
    const name = equals === -1 ? checked.id.slice(0, 5) : flag.slice(0, equals)
    if (!NAME.test(name)) {
      throw new UsageError(
        `--canister ${flag}: the name is 1 to 20 letters, digits or _, such as ledger=${checked.id}`
      )
    }
    if (byName.has(name)) {
      throw new UsageError(
        `--canister ${flag}: the name ${name} is taken; give each canister its own, such as ${name}2=${checked.id}`
      )
    }
    if (ids.has(checked.id)) {
      throw new UsageError(`--canister ${flag}: ${checked.id} is listed twice`)
    }
    byName.set(name, { name, id: checked.id })
    ids.add(checked.id)
  }
  return [...byName.values()]
}

function didFiles(
  flags: readonly string[],
  canisters: readonly ListedCanister[],
  home: () => string
): Map<string, string> {
  const files = new Map<string, string>()
  for (const flag of flags) {
    const equals = flag.indexOf("=")
    if (equals <= 0 || equals === flag.length - 1) {
      throw new UsageError(
        `--did ${flag}: write <name or id>=<path>, such as ledger=./ledger.did`
      )
    }
    const target = flag.slice(0, equals)
    const listed = canisters.find((canister) => canister.name === target)
    let id: string
    if (listed !== undefined) {
      id = listed.id
    } else {
      const checked = checkCanisterId(target)
      if (!checked.ok) {
        throw new UsageError(
          `--did ${flag}: ${target} is neither a --canister name nor a canister id (${checked.message})`
        )
      }
      id = checked.id
    }
    if (files.has(id))
      throw new UsageError(`--did ${flag}: ${id} has a .did already`)
    files.set(id, expandHome(flag.slice(equals + 1), home))
  }
  return files
}

/** `~/x` as a shell would read it: an MCP client starts the server without a shell. */
function expandHome(path: string, home: () => string): string {
  return path === "~" || path.startsWith("~/") ? home() + path.slice(1) : path
}
