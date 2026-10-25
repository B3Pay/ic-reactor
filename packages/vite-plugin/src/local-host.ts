/**
 * The local network as `@ic-reactor/core` knows it: where its `"local"` is,
 * and which hosts it takes for this machine. The plugin asks whether a
 * replica's root key may be fetched from a host (`fetch.ts`), and whether a
 * page's `Host` is one on which core believes the `ic_env` cookie
 * (`dev-environment.ts`). Both answers must be core's, so both read this rule.
 *
 * A copy of `isLocalHostname` and `LOCAL_HOST` in core's `src/network.ts`,
 * which the plugin does not depend on: change them together.
 */

/**
 * icp-cli's local network on its default gateway port: core's `"local"`, and
 * where `/api` goes while `icp` reports no network.
 */
export const DEFAULT_LOCAL_REPLICA = "http://127.0.0.1:8000"

/**
 * Whether `hostname` is this machine: `localhost` and its subdomains, all of
 * 127.0.0.0/8, and `::1`, with or without the brackets a URL's `hostname`
 * keeps around it.
 * The rule `@ic-reactor/core`'s `createClient` follows to decide whether a
 * replica's root key may be fetched from it, and whether a page may believe
 * the `ic_env` cookie.
 */
export function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    /^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(hostname) ||
    hostname === "::1" ||
    hostname === "[::1]"
  )
}
