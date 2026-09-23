import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { Cbor, NodeType, type HashTree } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"

/**
 * `PollingOptions.blsVerify` replaces the function that checks a
 * certificate's BLS signature. A Reactor passes its polling options to
 * `pollForResponse`, which honours it, but the synchronous (v4) path — the
 * one most update calls take — built its certificate without it, so a caller's
 * verifier was used only for calls that happened to fall back to polling.
 * The SDK's own `HttpAgent.update`, which `Actor` uses, passes it on both paths.
 *
 * The certificates here carry a signature no verifier would accept, so a call
 * succeeds only if the caller's verifier, not the built-in one, is asked.
 */

const CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const REQUEST_ID = new Uint8Array(32).fill(7)
const REPLY = IDL.encode([IDL.Nat], [42n])

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({ transfer: IDL.Func([], [IDL.Nat], []) })

interface Ledger {
  transfer: () => Promise<bigint>
}

const utf8 = (text: string) => new TextEncoder().encode(text)

const leb128 = (value: bigint) => {
  const out: number[] = []
  let rest = value
  do {
    let byte = Number(rest & 0x7fn)
    rest >>= 7n
    if (rest !== 0n) byte |= 0x80
    out.push(byte)
  } while (rest !== 0n)
  return new Uint8Array(out)
}

const leaf = (value: Uint8Array): HashTree => [NodeType.Leaf, value] as HashTree
const labeled = (label: Uint8Array, subtree: HashTree): HashTree =>
  [NodeType.Labeled, label, subtree] as HashTree
const fork = (left: HashTree, right: HashTree): HashTree =>
  [NodeType.Fork, left, right] as HashTree

/** A v4 answer whose certificate says the call replied, with a bogus signature. */
const repliedWithBogusSignature = () => {
  const tree = fork(
    labeled(
      utf8("request_status"),
      labeled(
        REQUEST_ID,
        fork(
          labeled(utf8("reply"), leaf(REPLY)),
          labeled(utf8("status"), leaf(utf8("replied")))
        )
      )
    ),
    labeled(utf8("time"), leaf(leb128(BigInt(Date.now()) * 1_000_000n)))
  )
  const certificate = Cbor.encode({ tree, signature: new Uint8Array(48) })
  return {
    requestId: REQUEST_ID,
    response: {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: [],
      body: { status: "replied", certificate },
    },
  }
}

describe("pollingOptions.blsVerify on a synchronous update response", () => {
  let clientManager: ClientManager

  beforeEach(() => {
    clientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "https://icp-api.io" },
    })
    vi.spyOn(clientManager.agent, "call").mockResolvedValue(
      repliedWithBogusSignature() as never
    )
  })

  it("is used when set on the reactor", async () => {
    const blsVerify = vi.fn(async () => true)
    const ledger = new Reactor<Ledger>({
      clientManager,
      name: "ledger",
      canisterId: CANISTER_ID,
      idlFactory,
      pollingOptions: { blsVerify },
    })

    await expect(ledger.callMethod({ functionName: "transfer" })).resolves.toBe(
      42n
    )
    expect(blsVerify).toHaveBeenCalledTimes(1)
  })

  it("is used when set for one call", async () => {
    const blsVerify = vi.fn(async () => true)
    const ledger = new Reactor<Ledger>({
      clientManager,
      name: "ledger",
      canisterId: CANISTER_ID,
      idlFactory,
    })

    await expect(
      ledger.callMethod({
        functionName: "transfer",
        callConfig: { pollingOptions: { blsVerify } },
      })
    ).resolves.toBe(42n)
    expect(blsVerify).toHaveBeenCalledTimes(1)
  })

  it("leaves the built-in verifier in charge when none is set", async () => {
    // Guard: the bogus signature is refused as before.
    const ledger = new Reactor<Ledger>({
      clientManager,
      name: "ledger",
      canisterId: CANISTER_ID,
      idlFactory,
    })

    await expect(
      ledger.callMethod({ functionName: "transfer" })
    ).rejects.toMatchObject({ cause: { name: "TrustError" } })
  })
})
