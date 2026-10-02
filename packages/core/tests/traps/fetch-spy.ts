/**
 * A `fetch` for the traps that need to see what a client sends to the network
 * without a replica behind it, passed as `createClient({ fetch })`.
 *
 * It records the path of every request and answers each with an HTTP error
 * that no client re-sends after (400), so a call ends at once, as
 * `not_delivered`.
 *
 * Not a test file, and not part of the package.
 */

/** A `fetch` that records what it was asked for, and refuses it. */
export interface FetchSpy {
  readonly fetch: typeof globalThis.fetch
  /** The path of every request, in order, such as `/api/v2/status`. */
  readonly paths: string[]
}

/** Creates a {@link FetchSpy}. */
export function fetchSpy(status = 400): FetchSpy {
  const paths: string[] = []
  return {
    paths,
    fetch: (input) => {
      const url = input instanceof Request ? input.url : String(input)
      paths.push(new URL(url).pathname)
      return Promise.resolve(new Response("refused by the spy", { status }))
    },
  }
}
