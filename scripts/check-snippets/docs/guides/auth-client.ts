// The Auth guide's `./auth-client`: the module that keeps the AuthClient each
// client's factory builds, beside the client, as the guide shows.
import { createClient, type Client } from "@ic-reactor/core"
import { AuthClient } from "@icp-sdk/auth/client"

/** The app's network, for its client and the clients built beside it. */
export const network = "ic"

/** Internet Identity's canister, where the factory is handed no provider. */
const INTERNET_IDENTITY = "rdmx6-jaaaa-aaaaa-aaadq-cai"

interface Built {
  readonly authClient: AuthClient
  /** The canister that mints the sign-in, which signs the attributes too. */
  readonly signer: string
}

// Keyed by the client's QueryClient, which every view of the client that
// `useClient()` returns shares: a view is an object of its own.
const builtBy = new WeakMap<Client["queryClient"], () => Built | undefined>()

/** What `client`'s auth factory built, once it has run. */
export const getAuthClient = (client: Client) =>
  builtBy.get(client.queryClient)?.()

export function createAppClient(): Client {
  let built: Built | undefined
  const client = createClient({
    network,
    auth: (handed) => {
      const authClient = new AuthClient({ ...handed, openIdProvider: "google" })
      built = {
        authClient,
        signer: handed.identityProvider?.canisterId ?? INTERNET_IDENTITY,
      }
      return authClient
    },
  })
  builtBy.set(client.queryClient, () => built)
  return client
}
