import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  render,
  screen,
  renderHook,
  waitFor,
  act,
} from "@testing-library/react"
import React, { useMemo } from "react"
import { QueryClient } from "@tanstack/react-query"
import { ActorMethod, CallConfig } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { createActorHooks } from "../src/createActorHooks.js"

/**
 * The multi-token pattern `forCanister` exists for: hooks built on one
 * sibling per token, so two tokens render side by side from one reactor, and
 * a mutation on one token refreshes that token's queries and no other's.
 * Retargeting a shared reactor with setCanisterId could do neither.
 */

interface LedgerActor {
  icrc1_symbol: ActorMethod<[], string>
  icrc1_transfer: ActorMethod<[bigint], bigint>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    icrc1_symbol: IDL.Func([], [IDL.Text], ["query"]),
    icrc1_transfer: IDL.Func([IDL.Nat], [IDL.Nat], []),
  })

const ICP = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const CKBTC = "mxzaz-hqaaa-aaaar-qaada-cai"

describe("hooks on forCanister siblings", () => {
  let queryClient: QueryClient
  let ledger: Reactor<LedgerActor>
  let calls: string[]

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    ledger = new Reactor<LedgerActor>({
      clientManager: new ClientManager({
        queryClient,
        agentOptions: { host: "https://icp-api.io" },
      }),
      name: "ledger",
      canisterId: ICP,
      idlFactory,
    })
    calls = []
    // Every sibling calls through the prototype, so one spy sees them all.
    vi.spyOn(Reactor.prototype, "callMethod").mockImplementation(
      async function (
        this: Reactor<LedgerActor>,
        {
          functionName,
          callConfig,
        }: { functionName: string; callConfig?: CallConfig }
      ) {
        const canister = String(callConfig?.canisterId ?? this.canisterId)
        calls.push(`${functionName}@${canister}`)
        return (
          functionName === "icrc1_symbol" ? `symbol of ${canister}` : 1n
        ) as never
      } as never
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function TokenSymbol({ canisterId }: { canisterId: string }) {
    const { useActorQuery } = useMemo(
      () => createActorHooks(ledger.forCanister(canisterId)),
      [canisterId]
    )
    const { data } = useActorQuery({ functionName: "icrc1_symbol" })
    return <span>{data ?? "…"}</span>
  }

  it("renders two tokens side by side, each from its own canister", async () => {
    render(
      <>
        <TokenSymbol canisterId={ICP} />
        <TokenSymbol canisterId={CKBTC} />
      </>
    )

    expect(await screen.findByText(`symbol of ${ICP}`)).toBeTruthy()
    expect(await screen.findByText(`symbol of ${CKBTC}`)).toBeTruthy()
    expect(calls.sort()).toEqual(
      [`icrc1_symbol@${CKBTC}`, `icrc1_symbol@${ICP}`].sort()
    )
  })

  it("a mutation on one token invalidates that token's queries only", async () => {
    const ckbtc = ledger.forCanister(CKBTC)
    await ledger.fetchQuery({ functionName: "icrc1_symbol" })
    await ckbtc.fetchQuery({ functionName: "icrc1_symbol" })

    const { useActorMutation } = createActorHooks(ckbtc)
    const { result } = renderHook(() =>
      useActorMutation({
        functionName: "icrc1_transfer",
        invalidateQueries: [{ functionName: "icrc1_symbol" }],
      })
    )
    await act(() => result.current.mutateAsync([5n]))

    const isInvalidated = (canisterId: string) =>
      queryClient
        .getQueryCache()
        .find({ queryKey: [canisterId, "icrc1_symbol"], exact: true })?.state
        .isInvalidated
    await waitFor(() => expect(isInvalidated(CKBTC)).toBe(true))
    expect(isInvalidated(ICP)).toBe(false)
    expect(calls).toContain(`icrc1_transfer@${CKBTC}`)
  })
})
