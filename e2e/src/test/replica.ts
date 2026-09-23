import { ClientManager } from "@ic-reactor/core"
import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env"
import { QueryClient } from "@tanstack/react-query"

/** The gateway of the `local` network in icp.yaml. */
const REPLICA_HOST = "http://127.0.0.1:8000"

/**
 * A client manager for the local replica, with its own query cache. Retries are
 * off, so a failed call fails the test at once instead of after the backoff.
 */
export function createClientManager(): ClientManager {
  return new ClientManager({
    agentOptions: {
      verifyQuerySignatures: false,
      host: REPLICA_HOST,
    },
    queryClient: new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    }),
  })
}

/**
 * The deployed hello_actor's canister ID, from the `ic_env` cookie that
 * setup.ts seeds with the output of `icp canister status`.
 */
export function helloActorCanisterId(): string {
  const canisterId = safeGetCanisterEnv<{
    readonly "PUBLIC_CANISTER_ID:hello_actor"?: string
  }>()?.["PUBLIC_CANISTER_ID:hello_actor"]
  if (!canisterId) {
    throw new Error(
      "No canister ID for hello_actor in the ic_env cookie. Run the suite with " +
        "`bash ./test.sh`, or start the network and `icp deploy hello_actor` first."
    )
  }
  return canisterId
}

// What `profile` returns, as src/actor/src/lib.rs builds it.
/** u128::MAX, the `balance` of every profile. */
export const PROFILE_BALANCE = 2n ** 128n - 1n
/** u64::MAX, the `nonce` of every profile. */
export const PROFILE_NONCE = 2n ** 64n - 1n
/** i128::MIN, the `delta` of every profile. */
export const PROFILE_DELTA = -(2n ** 127n)
/** The `avatar` of any owner but the anonymous principal, which has none. */
export const PROFILE_AVATAR = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
/** The message `boom` traps with. */
export const BOOM_MESSAGE = "boom: this method always traps"
