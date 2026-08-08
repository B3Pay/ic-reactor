import { describe, it, expect, beforeEach } from "vitest"
import { QueryClient, QueryObserver } from "@tanstack/query-core"
import { AnonymousIdentity } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { ClientManager } from "../src/client.js"

const CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"

/**
 * Query keys carry no principal, so a caller-scoped result stays readable under
 * the next identity for as long as it lives in the cache. Invalidating alone
 * left it there indefinitely once the component observing it unmounted.
 */
describe("ClientManager.updateAgent — cached data across an identity switch", () => {
  let queryClient: QueryClient
  let clientManager: ClientManager

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    clientManager = new ClientManager({
      queryClient,
      agentOptions: { host: "https://icp-api.io" },
    })
    clientManager.registerCanisterId(CANISTER_ID)
  })

  it("removes an inactive entry so the next identity cannot read it", () => {
    const key = [CANISTER_ID, "get_withdrawal_account"]
    queryClient.setQueryData(key, "ACCOUNT-OF-IDENTITY-A")
    expect(queryClient.getQueryData(key)).toBe("ACCOUNT-OF-IDENTITY-A")

    clientManager.updateAgent(Ed25519KeyIdentity.generate())

    expect(queryClient.getQueryData(key)).toBeUndefined()
  })

  it("removes it on sign-out too, not only on a switch between users", () => {
    const key = [CANISTER_ID, "my_profile"]
    queryClient.setQueryData(key, { name: "Ada" })

    clientManager.updateAgent(new AnonymousIdentity())

    expect(queryClient.getQueryData(key)).toBeUndefined()
  })

  it("leaves other canisters' and unrelated app queries alone", () => {
    // updateAgent is scoped to registered canister ids precisely so it does not
    // wipe an app's REST/GraphQL cache on every sign-in.
    const otherCanister = ["mc6ru-gyaaa-aaaar-qaaaq-cai", "icrc1_name"]
    const appQuery = ["rest", "user-settings"]
    queryClient.setQueryData(otherCanister, "ckTESTBTC")
    queryClient.setQueryData(appQuery, { theme: "dark" })
    queryClient.setQueryData([CANISTER_ID, "balance"], 42n)

    clientManager.updateAgent(Ed25519KeyIdentity.generate())

    expect(queryClient.getQueryData(otherCanister)).toBe("ckTESTBTC")
    expect(queryClient.getQueryData(appQuery)).toEqual({ theme: "dark" })
    expect(queryClient.getQueryData([CANISTER_ID, "balance"])).toBeUndefined()
  })

  it("marks an actively observed entry stale so its observer refetches", () => {
    // Active entries are invalidated rather than removed, so a mounted observer
    // reliably refetches instead of being torn out from under React.
    const key = [CANISTER_ID, "balance"]
    queryClient.setQueryData(key, 1n)

    // A query counts as active only while it has a subscribed, ENABLED
    // observer; one whose observers are all disabled is inactive and is removed
    // along with the rest. staleTime keeps this one from fetching on subscribe.
    const observer = new QueryObserver(queryClient, {
      queryKey: key,
      queryFn: async () => 2n,
      staleTime: Infinity,
    })
    const unsubscribe = observer.subscribe(() => {})

    clientManager.updateAgent(Ed25519KeyIdentity.generate())

    // Still present (not removed), and flagged for refetch.
    expect(queryClient.getQueryData(key)).toBe(1n)
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
    unsubscribe()
  })

  it("does not cancel a fetch a subscriber starts on notification", async () => {
    // Regression: the cache sweep used to run AFTER notifySubscribers. A
    // subscriber reacting by kicking off an imperative fetch for the new
    // principal created an observerless — therefore "inactive" — query, which
    // removeQueries then cancelled, rejecting the subscriber's promise with a
    // TanStack CancelledError and discarding the result.
    let started: Promise<unknown> | undefined
    clientManager.subscribe(() => {
      started = queryClient.fetchQuery({
        queryKey: [CANISTER_ID, "balance_after_switch"],
        queryFn: async () => "FETCHED-FOR-NEW-IDENTITY",
      })
    })

    clientManager.updateAgent(Ed25519KeyIdentity.generate())

    await expect(started).resolves.toBe("FETCHED-FOR-NEW-IDENTITY")
    expect(
      queryClient.getQueryData([CANISTER_ID, "balance_after_switch"])
    ).toBe("FETCHED-FOR-NEW-IDENTITY")
  })

  it("still clears the previous identity's data when a subscriber refetches", async () => {
    // The reordering must not weaken the guarantee the sweep exists for.
    const stale = [CANISTER_ID, "get_withdrawal_account"]
    queryClient.setQueryData(stale, "ACCOUNT-OF-IDENTITY-A")

    let started: Promise<unknown> | undefined
    clientManager.subscribe(() => {
      started = queryClient.fetchQuery({
        queryKey: [CANISTER_ID, "something_else"],
        queryFn: async () => "ok",
      })
    })

    clientManager.updateAgent(Ed25519KeyIdentity.generate())
    await started

    expect(queryClient.getQueryData(stale)).toBeUndefined()
  })
})
