/**
 * The handlers `createTestCanister` takes are typed from the service: each
 * receives its method's argument tuple and the call context, and must return
 * its method's result, so a handler that drifts from the `.did` fails to
 * compile rather than failing to encode at run time.
 *
 * Checked by `pnpm typecheck` (tests are in the typecheck project), not by
 * vitest.
 */
import { describe, it, expectTypeOf, vi } from "vitest"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"
import type { Principal } from "@icp-sdk/core/principal"
import {
  createTestCanister,
  type FakeCallContext,
  type FakeCanister,
  type TestCanisterHandler,
  type TestCanisterHandlers,
} from "../src/testing/index.js"

type TransferError = { InsufficientFunds: { balance: bigint } }

interface Ledger {
  balance_of: ActorMethod<[Principal], bigint>
  transfer: ActorMethod<
    [{ to: Principal; amount: bigint }],
    { Ok: bigint } | { Err: TransferError }
  >
  memo: ActorMethod<[[] | [string]], [] | [string]>
  stats: ActorMethod<[], [string, bigint]>
  reset: ActorMethod<[], undefined>
}

/** A service written with plain function types rather than `ActorMethod`. */
interface PlainService {
  echo: (text: string) => Promise<string>
}

declare const idlFactory: IDL.InterfaceFactory

describe("createTestCanister handlers", () => {
  it("receive the method's argument tuple and the caller", () => {
    createTestCanister<Ledger>(idlFactory, {
      balance_of: (args, context) => {
        expectTypeOf(args).toEqualTypeOf<[Principal]>()
        expectTypeOf(context).toEqualTypeOf<FakeCallContext>()
        expectTypeOf(context.caller).toEqualTypeOf<Principal>()
        return 0n
      },
      transfer: ([{ to, amount }]) => {
        expectTypeOf(to).toEqualTypeOf<Principal>()
        expectTypeOf(amount).toEqualTypeOf<bigint>()
        return { Ok: amount }
      },
      memo: ([memo]) => {
        expectTypeOf(memo).toEqualTypeOf<[] | [string]>()
        return memo
      },
    })
  })

  it("must return the method's result, or a promise of it", () => {
    createTestCanister<Ledger>(idlFactory, {
      balance_of: async () => 1n,
      transfer: () => ({ Err: { InsufficientFunds: { balance: 0n } } }),
      stats: () => ["ledger", 1n],
      // A method with no result may return nothing.
      reset: () => {},
    })

    createTestCanister<Ledger>(idlFactory, {
      // @ts-expect-error a nat is a bigint, not a number
      balance_of: () => 1,
    })
    createTestCanister<Ledger>(idlFactory, {
      // @ts-expect-error an Err must carry the method's error variant
      transfer: () => ({ Err: { NotFound: null } }),
    })
    createTestCanister<Ledger>(idlFactory, {
      // @ts-expect-error two results are a tuple
      stats: () => "ledger",
    })
  })

  it("are keyed by the service's method names", () => {
    createTestCanister<Ledger>(idlFactory, {
      // @ts-expect-error not a method of the service
      balanceOf: () => 0n,
    })
  })

  it("may leave methods out", () => {
    expectTypeOf(
      createTestCanister<Ledger>(idlFactory, {})
    ).toEqualTypeOf<FakeCanister>()
  })

  it("are typed from a service of plain function types too", () => {
    createTestCanister<PlainService>(idlFactory, {
      echo: ([text]) => {
        expectTypeOf(text).toEqualTypeOf<string>()
        return text
      },
    })
  })
})

describe("createTestCanister handlers as vi.fn() mocks", () => {
  it("are accepted, typed from TestCanisterHandler", () => {
    const transfer = vi.fn<TestCanisterHandler<Ledger, "transfer">>(
      ([{ amount }]) => ({ Ok: amount })
    )
    const balanceOf = vi.fn(() => 0n)

    createTestCanister<Ledger>(idlFactory, {
      transfer,
      balance_of: balanceOf,
    })
    transfer.mockReturnValueOnce({
      Err: { InsufficientFunds: { balance: 0n } },
    })
    // @ts-expect-error the mock keeps the handler's result type
    transfer.mockReturnValueOnce({ Ok: 1 })
    expectTypeOf(transfer.mock.calls[0][0]).toEqualTypeOf<
      [{ to: Principal; amount: bigint }]
    >()
  })
})

describe("TestCanisterHandler", () => {
  it("is the type of one method's handler", () => {
    expectTypeOf<TestCanisterHandler<Ledger, "balance_of">>().toEqualTypeOf<
      (args: [Principal], context: FakeCallContext) => bigint | Promise<bigint>
    >()
    expectTypeOf<TestCanisterHandlers<Ledger>["transfer"]>().toEqualTypeOf<
      TestCanisterHandler<Ledger, "transfer"> | undefined
    >()
  })
})
