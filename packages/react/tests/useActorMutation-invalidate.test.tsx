import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { useActorMutation } from "../src/hooks/useActorMutation.js"
import {
  createTestCanister,
  installFakeReplica,
  type FakeReplica,
} from "../src/testing.js"

interface TestActor {
  get_profile: ActorMethod<[], string>
  update_profile: ActorMethod<[{ name: string }], boolean>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    get_profile: IDL.Func([], [IDL.Text], ["query"]),
    update_profile: IDL.Func([IDL.Record({ name: IDL.Text })], [IDL.Bool], []),
  })

const CANISTER_ID = "bkyz2-fmaaa-aaaaa-qaaaq-cai"

let replica: FakeReplica

beforeEach(() => {
  let profile = "old"
  replica = installFakeReplica({
    canisters: {
      [CANISTER_ID]: createTestCanister<TestActor>(idlFactory, {
        get_profile: () => profile,
        update_profile: ([{ name }]) => {
          profile = name
          return true
        },
      }),
    },
  })
})

afterEach(() => {
  replica.restore()
})

describe("useActorMutation — invalidateQueries entries", () => {
  let queryClient: QueryClient
  let reactor: Reactor<TestActor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    reactor = new Reactor<TestActor>({
      clientManager: new ClientManager({
        queryClient,
        agentOptions: { host: replica.host },
      }),
      name: "test-canister",
      canisterId: CANISTER_ID,
      idlFactory,
    })
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it("skips undefined entries instead of invalidating the entire client", async () => {
    // Regression: React Query reads `{ queryKey: undefined }` as "match
    // everything", so one undefined entry wiped every query in the client —
    // including an app's unrelated non-canister queries. The natural
    // `[maybeQuery?.getQueryKey()]` idiom produces exactly that.
    queryClient.setQueryData(["unrelated", "a"], "A")
    queryClient.setQueryData(["unrelated", "b"], "B")

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(
      () =>
        useActorMutation({
          reactor,
          functionName: "update_profile",
          invalidateQueries: [undefined],
        }),
      { wrapper }
    )

    result.current.mutate([{ name: "Alice" }])
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).not.toHaveBeenCalled()
    expect(queryClient.getQueryState(["unrelated", "a"])?.isInvalidated).toBe(
      false
    )
    expect(queryClient.getQueryState(["unrelated", "b"])?.isInvalidated).toBe(
      false
    )
  })

  it("still invalidates the defined entries alongside an undefined one", async () => {
    const profileKey = reactor.generateQueryKey({ functionName: "get_profile" })
    await reactor.fetchQuery({ functionName: "get_profile" })
    queryClient.setQueryData(["unrelated", "a"], "A")

    const { result } = renderHook(
      () =>
        useActorMutation({
          reactor,
          functionName: "update_profile",
          invalidateQueries: [undefined, profileKey],
        }),
      { wrapper }
    )

    result.current.mutate([{ name: "Alice" }])
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(queryClient.getQueryState(profileKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(["unrelated", "a"])?.isInvalidated).toBe(
      false
    )
  })
})
