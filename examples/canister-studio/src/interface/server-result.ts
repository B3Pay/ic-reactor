// Every call of a server function goes through `serverResult`: a call can
// resolve with no result at all instead of rejecting.

/**
 * What a tool shows when a server function gave no result: it runs on the
 * studio's server, which StackBlitz cannot run.
 */
class ServerUnavailableError extends Error {
  override name = "ServerUnavailableError"

  constructor() {
    super(
      "This tool runs on the studio's server, which did not answer. StackBlitz cannot run the studio's server: clone the repository to use it."
    )
  }
}

/**
 * The result of a server function call, checked. Where server functions
 * cannot run (StackBlitz's WebContainer has no AsyncLocalStorage), the
 * server answers a plain, unserialized 500, and TanStack Start's client
 * resolves the call with `undefined` instead of rejecting. This throws a
 * `ServerUnavailableError` for that, and for anything else that is not a
 * `{ ok: boolean }` result.
 */
export async function serverResult<T extends { ok: boolean }>(
  call: Promise<T>
): Promise<T> {
  const result: unknown = await call
  if (
    typeof result !== "object" ||
    result === null ||
    typeof (result as { ok?: unknown }).ok !== "boolean"
  ) {
    throw new ServerUnavailableError()
  }
  return result as T
}
