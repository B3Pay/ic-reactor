import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryObserver } from "@tanstack/query-core"
import { QueryResponseStatus } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import type { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"

/** Two ledgers of the same type, as in a multi-token wallet. */
const TOKEN_A = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const TOKEN_B = "mc6ru-gyaaa-aaaar-qaaaq-cai"

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({ icrc1_name: IDL.Func([], [IDL.Text], ["query"]) })

/** Each ledger answers with its own name, so a crossed wire is visible. */
const nameOf = (canisterId: string) => `name of ${canisterId}`

const replyFor = (canisterId: Principal) => ({
  status: QueryResponseStatus.Replied,
  reply: { arg: IDL.encode([IDL.Text], [nameOf(canisterId.toText())]) },
})

/**
 * A query key names the canister `reactor.canisterId` held when the key was
 * built, but the query function used to read `reactor.canisterId` again each
 * time it ran. After `setCanisterId` — the documented way to switch between
 * ledgers of one type — anything that re-runs an existing query function (a
 * TanStack retry, a refetch of an observer whose component has not re-rendered)
 * fetched the NEW canister and cached its answer under the OLD canister's key.
 * Switching back then served token B's data as token A's.
 */
describe("a reactor query fetches from the canister its key names", () => {
  let queryClient: QueryClient
  let clientManager: ClientManager
  let reactor: Reactor
  let query: ReturnType<typeof vi.fn>

  beforeEach(() => {
    queryClient = new QueryClient({
      // `reactorRetry` declines to retry off the browser, so a plain count
      // stands in for the client default an app would configure.
      defaultOptions: { queries: { retry: 1, retryDelay: 5 } },
    })
    clientManager = new ClientManager({
      queryClient,
      agentOptions: { host: "https://icp-api.io" },
    })
    query = vi.fn(async (canisterId: Principal) => replyFor(canisterId))
    vi.spyOn(clientManager.agent, "query").mockImplementation(query as never)
    reactor = new Reactor({
      clientManager,
      name: "ledger",
      canisterId: TOKEN_A,
      idlFactory,
    })
  })

  it("keeps a query function on its own canister after setCanisterId", async () => {
    const options = reactor.getQueryOptions({
      functionName: "icrc1_name" as never,
    })
    expect(options.queryKey[0]).toBe(TOKEN_A)

    reactor.setCanisterId(TOKEN_B)

    if (typeof options.queryFn !== "function") throw new Error("no queryFn")
    await expect(options.queryFn({} as never)).resolves.toBe(nameOf(TOKEN_A))
    expect((query.mock.calls[0][0] as Principal).toText()).toBe(TOKEN_A)
  })

  it("does not cache the new canister's answer under the old key on a retry", async () => {
    // The first attempt fails transiently, and the user switches token while
    // TanStack waits to retry it.
    query.mockRejectedValueOnce(new Error("connection reset"))

    const pending = reactor.fetchQuery({ functionName: "icrc1_name" as never })
    reactor.setCanisterId(TOKEN_B)

    await expect(pending).resolves.toBe(nameOf(TOKEN_A))

    // Switching back must show token A's own data, not token B's.
    reactor.setCanisterId(TOKEN_A)
    expect(reactor.getQueryData({ functionName: "icrc1_name" as never })).toBe(
      nameOf(TOKEN_A)
    )
  })

  it("does not refetch another canister into an observer that was not re-keyed", async () => {
    // An observer built before the switch — a memoized component that did not
    // re-render — refetches on focus or invalidation with the function it has.
    const observer = new QueryObserver(
      queryClient,
      reactor.getQueryOptions({ functionName: "icrc1_name" as never })
    )
    const unsubscribe = observer.subscribe(() => {})
    await vi.waitFor(() =>
      expect(observer.getCurrentResult().data).toBe(nameOf(TOKEN_A))
    )

    reactor.setCanisterId(TOKEN_B)
    const refetched = await observer.refetch()
    unsubscribe()

    expect(refetched.data).toBe(nameOf(TOKEN_A))
    expect(
      queryClient.getQueryData([TOKEN_A, "icrc1_name"]) as string | undefined
    ).toBe(nameOf(TOKEN_A))
  })

  it("still honours a callConfig canister override", async () => {
    // Guard: pinning the default canister must not displace an explicit one.
    const options = reactor.getQueryOptions({
      functionName: "icrc1_name" as never,
      callConfig: { canisterId: TOKEN_B },
    })
    expect(options.queryKey[0]).toBe(TOKEN_B)

    if (typeof options.queryFn !== "function") throw new Error("no queryFn")
    await expect(options.queryFn({} as never)).resolves.toBe(nameOf(TOKEN_B))
  })

  it("leaves the query key itself unchanged", () => {
    // Guard: the fix is in what the function fetches, not in the key.
    expect(
      reactor.getQueryOptions({ functionName: "icrc1_name" as never }).queryKey
    ).toEqual([TOKEN_A, "icrc1_name"])
  })
})
