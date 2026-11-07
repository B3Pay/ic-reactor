// `--network ic|local|<url>` and `--root-key`: one choice, given both to the
// client that makes calls and to the agent that reads interfaces. Ported from
// examples/node-agent-tool.
//
// The root key is what every certificate is checked against, so it is never
// taken from a replica that is not on this machine:
//
// - `ic`: mainnet through https://icp-api.io, with the root key the agent
//   ships with. Nothing is fetched.
// - `local`: icp-cli's local network, http://127.0.0.1:8000. Its key is
//   fetched from it.
// - a local <url> (localhost, *.localhost, 127.0.0.0/8, [::1]): its key is
//   fetched from it.
// - any other <url>: the key must be given as `--root-key <hex>`. Without one
//   the server refuses to start: a key fetched from a remote host would be
//   whatever that host chose to send.
import type { Network } from "@ic-reactor/core"
import type { ReadAgentOptions } from "./interface/read-candid.ts"
import { UsageError } from "./usage.ts"

const IC_HOST = "https://icp-api.io"
const LOCAL_HOST = "http://127.0.0.1:8000"

export interface NetworkChoice {
  /** What `createClient({ network })` is given. */
  readonly network: Network
  /** The same network for the agent that reads canister interfaces. */
  readonly read: ReadAgentOptions
  /** The network and where its root key comes from, for a person to read. */
  readonly label: string
  /**
   * How long a loaded interface is used before its module hash is read
   * again: 0 on this machine, where a redeploy is a moment away and a
   * read_state costs nothing; the loader's default elsewhere.
   */
  readonly recheckMs?: number
}

/** Whether a URL's host is this machine: the same rule the client applies. */
export function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    hostname === "[::1]"
  )
}

/**
 * The network `--network` and `--root-key` name; mainnet when neither is given.
 *
 * @throws UsageError for a value that is not `ic`, `local` or an http(s) URL,
 * a remote URL without a root key, or a root key given for `ic` or `local`.
 */
export function networkFrom(
  flag: string | undefined,
  rootKeyHex: string | undefined
): NetworkChoice {
  const name = flag ?? "ic"
  if (name === "ic" || name === "local") {
    if (rootKeyHex !== undefined) {
      throw new UsageError(
        `--root-key goes with a --network <url>: "${name}" has its root key already`
      )
    }
    return name === "ic"
      ? {
          network: "ic",
          read: { host: IC_HOST, fetchRootKey: false },
          label: `ic (mainnet, ${IC_HOST}; root key built into the agent)`,
        }
      : {
          network: "local",
          read: { host: LOCAL_HOST, fetchRootKey: true },
          label: `local (${LOCAL_HOST}; root key fetched from this machine's replica)`,
          recheckMs: 0,
        }
  }

  let url: URL
  try {
    url = new URL(name)
  } catch {
    throw new UsageError(
      `--network ${JSON.stringify(name)} is not ic, local or a URL such as http://127.0.0.1:8000`
    )
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UsageError(`--network ${name}: the URL is http or https`)
  }
  const host = url.origin

  if (rootKeyHex !== undefined) {
    const rootKey = hexBytes(rootKeyHex, "--root-key")
    return {
      network: { host, rootKey },
      read: { host, rootKey, fetchRootKey: false },
      label: `${host} (root key given with --root-key)`,
    }
  }
  if (isLocalHost(url.hostname)) {
    return {
      network: { host },
      read: { host, fetchRootKey: true },
      label: `${host} (root key fetched from it, as it is on this machine)`,
      recheckMs: 0,
    }
  }
  throw new UsageError(
    `--network ${host} is not on this machine, so its root key is never fetched from it: ` +
      `pass the replica's root key as --root-key <hex> (DER), or use --network ic for mainnet`
  )
}

function hexBytes(text: string, what: string): Uint8Array {
  if (text === "" || !/^(?:[0-9a-fA-F]{2})*$/.test(text)) {
    throw new UsageError(`${what} is not hex: give the key's DER bytes as hex`)
  }
  return Uint8Array.from(text.match(/../g) ?? [], (pair) =>
    Number.parseInt(pair, 16)
  )
}
