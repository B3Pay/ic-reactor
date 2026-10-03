// Whether the page is served from this machine: the only place the dev
// account is offered and the local Internet Identity is used. The same test
// ic-reactor applies before it trusts the ic_env cookie: localhost, its
// subdomains, and the loopback addresses.

/** The part of `window.location` this reads. */
export interface PageLocation {
  readonly hostname: string
  readonly origin: string
}

export function isLocalPage(page: PageLocation): boolean {
  const { hostname } = page
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    hostname === "[::1]" ||
    hostname === "::1"
  )
}
