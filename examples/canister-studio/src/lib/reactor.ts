import { createClient, type Client } from "@ic-reactor/core"
import { AuthClient } from "@icp-sdk/auth/client"

/**
 * A canister whose interface is known only at run time (a live canister's
 * `candid:service`, a pasted .did): any method name, one `vars` value in, the
 * decoded reply out. `client.queryOptions(c, method, vars)` and
 * `client.mutationOptions(c, method)` accept a `Canister<DynActor>` with a
 * plain `string` method.
 */
export type DynActor = Record<string, (arg: unknown) => Promise<unknown>>

/**
 * How long a read stays fresh. Reads the server rendered are not read again
 * while the page hydrates, and revisits within a minute cost no request.
 */
const READ_STALE_TIME = 60_000

/**
 * The app's one ic-reactor client. `getRouter()` calls this once per request
 * on the server and once per tab in the browser, which is exactly the
 * lifetime a client needs: never call it anywhere else (never per render).
 *
 * - `network: "ic"`: mainnet, and the key segment `"ic"` on both sides, so
 *   the keys the server dehydrates are the keys the browser asks for.
 * - `auth`: Internet Identity. ic-reactor builds it only in a browser, on
 *   first use; on a server the client is anonymous (2vxsx-fae) and refuses
 *   every write before sending it.
 * - The stale time goes through `setQueryDefaults(["ic-reactor"], …)`, never
 *   `setDefaultOptions`, which would replace the client's own defaults (its
 *   read retry policy and the serializers that carry bigint and bytes through
 *   dehydration).
 */
export function createAppClient(): Client {
  const client = createClient({
    network: "ic",
    auth: (network) => new AuthClient(network),
  })
  client.queryClient.setQueryDefaults(["ic-reactor"], {
    staleTime: READ_STALE_TIME,
  })
  return client
}

/**
 * Argument values as the one `vars` value ic-reactor's builders take
 * (`queryOptions`, `queryKey`, `mutate`): nothing for no arguments, the value
 * itself for one, the tuple for two or more. Never `[value]` for one
 * argument: that encodes as a different (wrong) message.
 */
export function toVars(values: readonly unknown[]): unknown {
  if (values.length === 0) return undefined
  if (values.length === 1) return values[0]
  return [...values]
}
