import { defaultStringifySearch } from "@tanstack/react-router"
import { toHex } from "../lib/hex.ts"

/**
 * The most argument hex a shared link carries: 8 KiB of text, 4 KiB of
 * Candid. A link becomes a request line, and Node's HTTP server (Vite's, and
 * the production server's) answers 431 to a request whose request line and
 * headers pass 16 KiB together, before the page renders: half of that is
 * left for the rest of the URL and the headers.
 */
export const SHARED_ARGS_MAX_HEX = 8 * 1024

/** Whether these argument bytes fit in a shared link. */
export const argsFitInUrl = (bytes: Uint8Array): boolean =>
  bytes.length * 2 <= SHARED_ARGS_MAX_HEX

/**
 * The shareable URL of a call: `/canister/<id>?method=…&args=<hex>&run=true`
 * (no slash before the search: the router redirects that form to this one).
 * Arguments over {@link SHARED_ARGS_MAX_HEX} of hex are left out of the URL
 * (and so is `run`): the link then opens the method, unfilled.
 *
 * The search string is written by TanStack Router's own serializer, the one
 * the router parses links with: `run` reads back as the boolean `true`
 * (`run=1` would read back as the number 1), and a method name that would
 * parse as JSON is quoted. `run` is for reads only: the page never runs a
 * write from a link, whatever the link says.
 */
export function sharedCallUrl(
  canisterId: string,
  method: string,
  bytes: Uint8Array,
  run: boolean,
  opts?: { certified?: boolean }
): string {
  // No Candid message is empty (the shortest is 6 bytes): empty bytes are
  // arguments not known, such as a history entry too large to keep.
  const fits = bytes.length > 0 && argsFitInUrl(bytes)
  const search = defaultStringifySearch({
    method,
    args: fits ? toHex(bytes) : undefined,
    run: fits && run ? true : undefined,
    certified: opts?.certified === true ? true : undefined,
  })
  return `/canister/${encodeURIComponent(canisterId)}${search}`
}
