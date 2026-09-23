import { describe, it, expect, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, useIsMutating } from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { createActorHooks } from "../src/createActorHooks.js"

/**
 * `createMutation`'s hook and `useActorMethod` key their mutations by the
 * reactor's query key for the method, but the bound `useActorMutation` set no
 * `mutationKey`. `useIsMutating({ mutationKey })`, `useMutationState` and
 * `setMutationDefaults` could therefore never find its mutations (#564).
 */
interface CounterActor {
  increment: ActorMethod<[], bigint>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({ increment: IDL.Func([], [IDL.Nat], []) })

function setup() {
  const queryClient = new QueryClient()
  const reactor = new Reactor<CounterActor>({
    clientManager: new ClientManager({
      queryClient,
      agentOptions: { host: "https://icp-api.io" },
    }),
    name: "counter",
    canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
    idlFactory,
  })
  let finish: (value: bigint) => void = () => {}
  vi.spyOn(reactor, "callMethod").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve as (value: bigint) => void
      }) as never
  )
  return { queryClient, reactor, finish: (value: bigint) => finish(value) }
}

describe("useActorMutation's mutationKey", () => {
  it("is the method's key, so useIsMutating can find a pending mutation", async () => {
    const { queryClient, reactor, finish } = setup()
    const { useActorMutation } = createActorHooks(reactor)
    const mutationKey = reactor.getQueryOptions({
      functionName: "increment",
    }).queryKey

    const { result } = renderHook(() => ({
      mutation: useActorMutation({ functionName: "increment" }),
      pending: useIsMutating({ mutationKey }, queryClient),
    }))

    act(() => {
      result.current.mutation.mutate([])
    })
    await waitFor(() => expect(result.current.pending).toBe(1))

    await act(async () => {
      finish(1n)
    })
    await waitFor(() => expect(result.current.pending).toBe(0))
  })

  it("keeps an explicit mutationKey", async () => {
    const { queryClient, reactor } = setup()
    const { useActorMutation } = createActorHooks(reactor)

    const { result } = renderHook(() => ({
      mutation: useActorMutation({
        functionName: "increment",
        mutationKey: ["custom"],
      }),
      pending: useIsMutating({ mutationKey: ["custom"] }, queryClient),
    }))

    act(() => {
      result.current.mutation.mutate([])
    })
    await waitFor(() => expect(result.current.pending).toBe(1))
  })
})
