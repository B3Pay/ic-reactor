// The call layer against ic-reactor's own client on the in-memory replica:
// the ledger and the minter are mocked at their real mainnet ids, with
// `network: "ic"`, so every key here is the key production builds.
import { c, principal } from "@meantjs/schema"
import { isReactorError } from "@ic-reactor/core"
import { MutationObserver } from "@tanstack/react-query"
import { afterEach, describe, expect, it } from "vitest"
import { toHex } from "../lib/hex.ts"
import type { DynActor } from "../lib/reactor.ts"
import {
  createdAtTimeOf,
  dedupeShapeOf,
  isDuplicateErr,
  stampCreatedAtTime,
} from "./dedupe.ts"
import { callKindOf } from "./kinds.ts"
import { prepareCall } from "./prepare.ts"
import { readQueryOptions } from "./query-options.ts"
import { suggestReadBack } from "./readback.ts"
import { canisterOf } from "./useCanisterHandle.ts"
import {
  CKBTC_LEDGER,
  CKBTC_MINTER,
  ICP_LEDGER,
  SEED_1,
  SEED_2,
  createTestLedger,
  methodOf,
  transferArg,
  typedInterface,
  type TestLedger,
} from "./testing/fixtures.ts"

let ledger: TestLedger | undefined
afterEach(() => {
  ledger?.test.client.dispose()
  ledger = undefined
})

const BOB = principal("aaaaa-aa")
const ledgerIface = typedInterface(CKBTC_LEDGER)
const transfer = methodOf(ledgerIface, "icrc1_transfer")
const balanceOf = methodOf(ledgerIface, "icrc1_balance_of")

function setUp(options: { signedIn?: boolean } = {}) {
  const made = createTestLedger(options)
  ledger = made
  const { client } = made.test
  const can = canisterOf(client, ledgerIface)
  return { ...made, client, can }
}

/** Sends `vars` through a mutation built from the client's own options, as useMutation does. */
async function mutate(
  observer: { mutate(vars: unknown): Promise<unknown> },
  vars: unknown
): Promise<{ ok: true; data: unknown } | { ok: false; error: unknown }> {
  try {
    return { ok: true, data: await observer.mutate(vars) }
  } catch (error) {
    return { ok: false, error }
  }
}

function transferCall(amount: bigint, stamp?: bigint) {
  const plain = prepareCall(transfer, [transferArg(BOB, amount)])
  if (plain === undefined) throw new Error("transfer does not encode")
  if (stamp === undefined) return plain
  const stamped = stampCreatedAtTime(transfer, "nat64", plain, stamp)
  if (stamped === undefined) throw new Error("stamped transfer does not encode")
  return stamped
}

describe("writes", () => {
  it("refuses an anonymous write before sending anything", async () => {
    const { client, can, test } = setUp({ signedIn: false })
    const observer = new MutationObserver(
      client.queryClient,
      client.mutationOptions(can, transfer.name)
    )
    const sent = await mutate(observer, transferCall(5n).vars)
    expect(sent.ok).toBe(false)
    const error = sent.ok ? undefined : sent.error
    expect(
      isReactorError(error) && [error.kind, error.code, error.mayHaveExecuted]
    ).toEqual(["unauthenticated", "anonymous_write", false])
    expect(
      test.requests.filter(
        (r) => r.endpoint === "call" || r.endpoint === "query"
      )
    ).toHaveLength(0)
  })

  it("after a lost reply, offers the same write through resendOf, which answers Duplicate", async () => {
    const { client, can, test, setBalance, transfers } = setUp()
    setBalance(SEED_1, 1_000n)
    const observer = new MutationObserver(
      client.queryClient,
      client.mutationOptions(can, transfer.name)
    )
    const call = transferCall(100n, 1_760_000_000_000_000_000n)
    test.dropNextReply()
    const first = await mutate(observer, call.vars)
    const lost = first.ok ? undefined : first.error
    expect(isReactorError(lost) && [lost.kind, lost.mayHaveExecuted]).toEqual([
      "outcome_unknown",
      true,
    ])

    const again = client.resendOf(lost, can, transfer.name, {
      dedupedBy: createdAtTimeOf,
    })
    expect(again?.from).toBe(SEED_1)
    expect(again?.arg).toBe(call.vars)

    const resent = await mutate(observer, again?.arg)
    const duplicate = resent.ok ? undefined : resent.error
    expect(isReactorError(duplicate) && duplicate.kind).toBe("canister_err")
    expect(isReactorError(duplicate) && isDuplicateErr(duplicate.err)).toBe(
      true
    )
    // It ran exactly once.
    expect(transfers).toHaveLength(1)
  })

  it("offers no re-send without created_at_time, or to another caller", async () => {
    const { client, can, test, setBalance } = setUp()
    setBalance(SEED_1, 1_000n)
    const observer = new MutationObserver(
      client.queryClient,
      client.mutationOptions(can, transfer.name)
    )
    test.dropNextReply()
    const plain = await mutate(observer, transferCall(100n).vars)
    const unstamped = plain.ok ? undefined : plain.error
    expect(
      client.resendOf(unstamped, can, transfer.name, {
        dedupedBy: createdAtTimeOf,
      })
    ).toBeUndefined()

    test.dropNextReply()
    const stamped = await mutate(
      observer,
      transferCall(100n, 1_760_000_000_000_000_001n).vars
    )
    const lost = stamped.ok ? undefined : stamped.error
    expect(
      client.resendOf(lost, can, transfer.name, { dedupedBy: createdAtTimeOf })
    ).toBeDefined()
    test.auth.switchTo(2)
    expect(client.caller()).toBe(SEED_2)
    expect(
      client.resendOf(lost, can, transfer.name, { dedupedBy: createdAtTimeOf })
    ).toBeUndefined()
  })

  it("rejects an Err result as canister_err with the canister's payload", async () => {
    const { client, can } = setUp()
    const observer = new MutationObserver(
      client.queryClient,
      client.mutationOptions(can, transfer.name)
    )
    const sent = await mutate(observer, transferCall(5_000n).vars)
    const error = sent.ok ? undefined : sent.error
    expect(
      isReactorError(error) && [error.kind, error.mayHaveExecuted]
    ).toEqual(["canister_err", false])
    expect(isReactorError(error) && error.err).toEqual({
      tag: "InsufficientFunds",
      value: { balance: 0n },
    })
  })

  it("refuses arguments that do not encode, with issues at $args[…] paths", async () => {
    const { client, can, test } = setUp()
    const observer = new MutationObserver(
      client.queryClient,
      client.mutationOptions(can, transfer.name)
    )
    const sent = await mutate(observer, {
      ...transferArg(BOB, 1n),
      amount: "lots",
    })
    const error = sent.ok ? undefined : sent.error
    expect(isReactorError(error) && error.kind).toBe("invalid_args")
    expect(
      isReactorError(error) && error.issues?.map((issue) => issue.path)
    ).toEqual(["$args[0].amount"])
    expect(test.requests.filter((r) => r.endpoint === "call")).toHaveLength(0)
  })
})

describe("reads", () => {
  it("keys every read by the caller, and keeps the certified twin apart", async () => {
    const { client, can, test, setBalance } = setUp()
    setBalance(SEED_1, 42n)
    const call = prepareCall(balanceOf, [
      { owner: principal(SEED_1), subaccount: null },
    ])
    const options = readQueryOptions(client, can, balanceOf, call?.vars)
    expect(options.queryKey).toEqual([
      "ic-reactor",
      "ic",
      SEED_1,
      CKBTC_LEDGER,
      "icrc1_balance_of",
      toHex(call?.bytes ?? new Uint8Array()),
    ])
    expect(await client.queryClient.fetchQuery(options)).toBe(42n)

    const twin = readQueryOptions(
      client,
      canisterOf(client, ledgerIface, true),
      balanceOf,
      call?.vars
    )
    expect(twin.queryKey.at(-1)).toBe("certified")
    expect(await client.queryClient.fetchQuery(twin)).toBe(42n)

    test.auth.switchTo(2)
    const other = readQueryOptions(client, can, balanceOf, call?.vars)
    expect(other.queryKey[2]).toBe(SEED_2)
    expect(client.queryClient.getQueryData(other.queryKey)).toBeUndefined()
  })

  it("reads an idempotent update only with the opt-in", async () => {
    const { client } = setUp()
    const minter = typedInterface(CKBTC_MINTER)
    const method = methodOf(minter, "get_btc_address")
    expect(callKindOf(minter, method)).toEqual({ kind: "idempotent" })
    const can = canisterOf(client, minter)
    const vars = { owner: null, subaccount: null }
    expect(() => readQueryOptions(client, can, method, vars)).toThrow(TypeError)
    const options = readQueryOptions(client, can, method, vars, {
      idempotent: true,
    })
    expect(options).toMatchObject({
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    })
    expect(await client.queryClient.fetchQuery(options)).toBe(`bc1q-${SEED_1}`)
  })

  it("refuses a composite query on the certified twin", () => {
    const { client } = setUp()
    const actor = c.service({ total: c.func([], [c.nat], "composite_query") })
    const iface = { ...ledgerIface, actor }
    const total = {
      name: "total",
      mode: "composite_query" as const,
      args: [],
      results: [c.nat],
    }
    const certified = client.canister<DynActor>(actor, {
      id: CKBTC_LEDGER,
      certified: true,
    })
    expect(callKindOf(iface, total)).toEqual({
      kind: "read",
      certifiable: false,
    })
    expect(() => readQueryOptions(client, certified, total, undefined)).toThrow(
      TypeError
    )
  })
})

describe("dedupe and read-back", () => {
  it("finds created_at_time in ICRC and ICP ledger arguments only", () => {
    const icp = typedInterface(ICP_LEDGER)
    expect(dedupeShapeOf(transfer)).toBe("nat64")
    expect(dedupeShapeOf(methodOf(icp, "icrc2_approve"))).toBe("nat64")
    expect(dedupeShapeOf(methodOf(icp, "transfer"))).toBe("timestamp")
    expect(dedupeShapeOf(balanceOf)).toBeUndefined()
  })

  it("stamps a new argument object and never changes the one it was given", () => {
    const plain = transferCall(5n)
    const stamped = stampCreatedAtTime(transfer, "nat64", plain, 7n)
    expect(createdAtTimeOf(plain.vars)).toBeNull()
    expect(createdAtTimeOf(stamped?.vars)).toBe(7n)
    expect(stamped?.vars).not.toBe(plain.vars)
    expect(toHex(stamped?.bytes ?? new Uint8Array())).not.toBe(
      toHex(plain.bytes)
    )
  })

  it("suggests the sender's balance to read back after an unknown transfer", () => {
    const suggestion = suggestReadBack(
      ledgerIface,
      transfer,
      transferCall(5n).values,
      SEED_1
    )
    expect(suggestion?.method.name).toBe("icrc1_balance_of")
    expect(suggestion?.call.vars).toEqual({ owner: SEED_1, subaccount: null })
  })
})
