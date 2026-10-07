// Scenario 2, networks: `--network ic|local|<url>` onto createClient's
// `network` option, and the root-key rule (packages/core/llms.txt, Setup).
//
// The root key is what every certificate is checked against, so it is never
// taken from a replica that is not on this machine:
//
// - `ic`: mainnet through https://icp-api.io, with the root key the agent
//   ships with. Nothing is fetched.
// - `local`: icp-cli's local network, http://127.0.0.1:8000. The client
//   fetches that replica's key.
// - a local <url> (localhost, *.localhost, 127.0.0.0/8, [::1]), such as an
//   icp-cli network on another port: `{ host }`, and the client fetches its key.
// - any other <url>: `{ host, rootKey }`, with the key given as
//   `--root-key <hex>`. Without one this tool refuses: a key fetched from a
//   remote host would be whatever that host chose to send.
import type { Network } from "@ic-reactor/core"
import { hexArg, UsageError } from "./input.ts"

/** A network, chosen on the command line. */
export interface NetworkChoice {
  /** What `createClient({ network })` is given. */
  readonly network: Network
  /** Where the root key comes from, for a person to read. */
  readonly rootKey: string
  /** The flags that pick this network again, for a command printed to re-run. */
  readonly flags: readonly string[]
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
          rootKey: "mainnet's, built into the agent",
          flags: flag === undefined ? [] : ["--network", "ic"],
        }
      : {
          network: "local",
          rootKey: "fetched from the local replica",
          flags: ["--network", "local"],
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
  const flags = ["--network", host]

  if (rootKeyHex !== undefined) {
    return {
      network: { host, rootKey: hexArg(rootKeyHex, "--root-key") },
      rootKey: "given with --root-key, never fetched",
      flags: [...flags, "--root-key", rootKeyHex],
    }
  }
  if (isLocalHost(url.hostname)) {
    return {
      network: { host },
      rootKey: `fetched from ${host}, which is on this machine`,
      flags,
    }
  }
  throw new UsageError(
    `--network ${host} is not on this machine, so its root key is never fetched from it: ` +
      `pass the replica's root key as --root-key <hex> (DER), or use --network ic for mainnet`
  )
}
