// How long the browser keeps using data the server read, before it reads
// again. With TanStack's default (0), every read the server hydrated would be
// stale on arrival, and each card would fetch it again as soon as it mounted.
// A minute after the server's read, a remount or a refocused window reads it
// again, as the browser's own caller.
//
// Rule: add options by spreading them over the client's,
// `{ ...client.queryOptions(...), ...SERVER_DATA }`; never by building a key
// or a query function by hand.
export const SERVER_DATA = { staleTime: 60_000 } as const
