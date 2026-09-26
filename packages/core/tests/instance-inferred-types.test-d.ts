/**
 * `ServiceOf`, `TransformOf`, `ReactorArgsOf`, `ReactorDataOf` and
 * `ReactorErrorOf` read the service and transform off `typeof reactor`, and
 * give exactly the types the three-parameter forms give when both are
 * spelled out.
 *
 * Checked by `pnpm typecheck` (tests are in the typecheck project), not by
 * vitest.
 */
import { describe, it, expectTypeOf } from "vitest"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { Principal } from "@icp-sdk/core/principal"
import type { Reactor } from "../src/reactor.js"
import type { DisplayReactor } from "../src/display-reactor.js"
import type {
  BaseActor,
  FunctionName,
  ReactorArgs,
  ReactorArgsOf,
  ReactorDataOf,
  ReactorErrorOf,
  ReactorReturnErr,
  ReactorReturnOk,
  ServiceOf,
  TransformOf,
} from "../src/types/reactor.js"
import type { CanisterError } from "../src/errors/index.js"

interface Account {
  owner: Principal
  subaccount: [] | [Uint8Array]
}

type TransferError =
  { InsufficientFunds: { balance: bigint } } | { TooOld: null }

interface Ledger {
  icrc1_balance_of: ActorMethod<[Account], bigint>
  icrc1_transfer: ActorMethod<
    [{ to: Account; amount: bigint }],
    { Ok: bigint } | { Err: TransferError }
  >
  icrc1_symbol: ActorMethod<[], string>
}

declare const ledger: Reactor<Ledger>
declare const displayLedger: DisplayReactor<Ledger>
declare const untyped: Reactor

/** A subclass that passes its service and transform on, as candid's do. */
declare class LedgerReactor extends DisplayReactor<Ledger> {
  extra(): void
}
declare const subclassed: LedgerReactor

describe("ServiceOf and TransformOf", () => {
  it("read back the type arguments a Reactor was built with", () => {
    expectTypeOf<ServiceOf<typeof ledger>>().toEqualTypeOf<Ledger>()
    expectTypeOf<TransformOf<typeof ledger>>().toEqualTypeOf<"candid">()
    expectTypeOf(ledger).toEqualTypeOf<
      Reactor<ServiceOf<typeof ledger>, TransformOf<typeof ledger>>
    >()
  })

  it("read them from a DisplayReactor and a subclass of one", () => {
    expectTypeOf<ServiceOf<typeof displayLedger>>().toEqualTypeOf<Ledger>()
    expectTypeOf<TransformOf<typeof displayLedger>>().toEqualTypeOf<"display">()
    expectTypeOf(displayLedger).toEqualTypeOf<
      DisplayReactor<
        ServiceOf<typeof displayLedger>,
        TransformOf<typeof displayLedger>
      >
    >()

    expectTypeOf<ServiceOf<typeof subclassed>>().toEqualTypeOf<Ledger>()
    expectTypeOf<TransformOf<typeof subclassed>>().toEqualTypeOf<"display">()
    expectTypeOf(subclassed).toExtend<
      DisplayReactor<
        ServiceOf<typeof subclassed>,
        TransformOf<typeof subclassed>
      >
    >()
  })

  it("give BaseActor and candid for a reactor built without a service type", () => {
    expectTypeOf<ServiceOf<typeof untyped>>().toEqualTypeOf<BaseActor>()
    expectTypeOf<TransformOf<typeof untyped>>().toEqualTypeOf<"candid">()
    expectTypeOf(untyped).toEqualTypeOf<
      Reactor<ServiceOf<typeof untyped>, TransformOf<typeof untyped>>
    >()
  })

  it("name the methods through FunctionName", () => {
    expectTypeOf<FunctionName<ServiceOf<typeof ledger>>>().toEqualTypeOf<
      "icrc1_balance_of" | "icrc1_transfer" | "icrc1_symbol"
    >()
  })

  it("take only a reactor", () => {
    // @ts-expect-error a service type is not a reactor
    type _NotAReactor = ServiceOf<Ledger>
    // @ts-expect-error a plain object is not a reactor either
    type _NoTransform = TransformOf<{ transform: "display" }>
  })
})

describe("ReactorArgsOf", () => {
  it("equals ReactorArgs with the reactor's service and transform", () => {
    expectTypeOf<
      ReactorArgsOf<typeof ledger, "icrc1_balance_of">
    >().toEqualTypeOf<ReactorArgs<Ledger, "icrc1_balance_of", "candid">>()
    expectTypeOf<
      ReactorArgsOf<typeof displayLedger, "icrc1_balance_of">
    >().toEqualTypeOf<ReactorArgs<Ledger, "icrc1_balance_of", "display">>()
  })

  it("types an account the reactor's own call takes, in its form", () => {
    type DisplayAccount = ReactorArgsOf<
      typeof displayLedger,
      "icrc1_balance_of"
    >[0]
    expectTypeOf<DisplayAccount["owner"]>().toEqualTypeOf<string>()
    const account: DisplayAccount = { owner: "aaaaa-aa", subaccount: null }
    void displayLedger.callMethod({
      functionName: "icrc1_balance_of",
      args: [account],
    })

    type RawAccount = ReactorArgsOf<typeof ledger, "icrc1_balance_of">[0]
    expectTypeOf<RawAccount>().toEqualTypeOf<Account>()
  })

  it("rejects a method the service does not have", () => {
    // @ts-expect-error not a method of the ledger
    type _Missing = ReactorArgsOf<typeof ledger, "icrc2_approve">
  })
})

describe("ReactorDataOf", () => {
  it("equals ReactorReturnOk with the reactor's service and transform", () => {
    expectTypeOf<
      ReactorDataOf<typeof ledger, "icrc1_transfer">
    >().toEqualTypeOf<ReactorReturnOk<Ledger, "icrc1_transfer", "candid">>()
    expectTypeOf<
      ReactorDataOf<typeof displayLedger, "icrc1_transfer">
    >().toEqualTypeOf<ReactorReturnOk<Ledger, "icrc1_transfer", "display">>()
  })

  it("is what the reactor's call resolves with: the Ok value, in its form", () => {
    expectTypeOf<
      ReactorDataOf<typeof ledger, "icrc1_transfer">
    >().toEqualTypeOf<bigint>()
    expectTypeOf<
      ReactorDataOf<typeof displayLedger, "icrc1_transfer">
    >().toEqualTypeOf<string>()
    expectTypeOf(
      displayLedger.callMethod({ functionName: "icrc1_symbol" })
    ).toEqualTypeOf<
      Promise<ReactorDataOf<typeof displayLedger, "icrc1_symbol">>
    >()
  })
})

describe("ReactorErrorOf", () => {
  it("equals ReactorReturnErr with the reactor's service and transform", () => {
    expectTypeOf<
      ReactorErrorOf<typeof ledger, "icrc1_transfer">
    >().toEqualTypeOf<ReactorReturnErr<Ledger, "icrc1_transfer", "candid">>()
    expectTypeOf<
      ReactorErrorOf<typeof displayLedger, "icrc1_transfer">
    >().toEqualTypeOf<ReactorReturnErr<Ledger, "icrc1_transfer", "display">>()
  })

  it("carries the Err value in the reactor's form", () => {
    type DisplayErr =
      Extract<
        ReactorErrorOf<typeof displayLedger, "icrc1_transfer">,
        CanisterError<unknown>
      > extends CanisterError<infer E>
        ? E
        : never
    expectTypeOf<
      Extract<DisplayErr, { _type: "InsufficientFunds" }>["InsufficientFunds"]
    >().toEqualTypeOf<{ balance: string }>()
  })
})
