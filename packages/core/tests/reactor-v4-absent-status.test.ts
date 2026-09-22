import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { Certificate, LookupPathStatus } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"

const CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const REQUEST_ID = new Uint8Array(32).fill(7)

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({ transfer: IDL.Func([], [IDL.Nat], []) })

const text = (s: string) => new TextEncoder().encode(s)

/** A verified certificate that answers only the request_status leaves given. */
const certificateWith = (entries: Record<string, Uint8Array>) => ({
  lookup_path: (path: Array<Uint8Array | string>) => {
    const last = path[path.length - 1]
    const key = typeof last === "string" ? last : new TextDecoder().decode(last)
    return key in entries
      ? { status: LookupPathStatus.Found, value: entries[key] }
      : { status: LookupPathStatus.Absent }
  },
})

/** The v4 sync call's 200 answer: a certificate rather than a 202. */
const certified = () => ({
  requestId: REQUEST_ID,
  response: {
    ok: true,
    status: 200,
    statusText: "OK",
    body: { certificate: new Uint8Array([1, 2, 3]) },
    headers: [],
  },
})

/**
 * A boundary node can answer the sync call with a valid certificate that does
 * not contain this request at all — its queue was full, or the request had not
 * been processed yet. The call is still live, so its outcome is unknown rather
 * than failed. `@icp-sdk/core`'s own `HttpAgent.update` polls read_state in
 * that case (icp-js-core#1330); Reactor re-implements that response handling
 * and reported "Call was returned undefined" instead, so a transfer that went
 * on to commit surfaced as an error the user would retry.
 */
describe("an update call whose certificate does not know the request", () => {
  let clientManager: ClientManager

  beforeEach(() => {
    clientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "https://icp-api.io" },
    })
    vi.spyOn(clientManager.agent, "call").mockResolvedValue(
      certified() as never
    )
    vi.spyOn(Certificate, "create").mockResolvedValueOnce(
      certificateWith({}) as never
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns the result a poll finds instead of failing the call", async () => {
    const readState = vi
      .spyOn(clientManager.agent, "readState")
      .mockResolvedValueOnce({
        certificate: new Uint8Array(),
        verifiedCertificate: certificateWith({
          status: text("replied"),
          reply: IDL.encode([IDL.Nat], [42n]),
        }),
      } as never)

    const reactor = new Reactor({
      clientManager,
      name: "ledger",
      canisterId: CANISTER_ID,
      idlFactory,
      pollingOptions: { strategy: async () => {} },
    })

    await expect(
      reactor.callMethod({ functionName: "transfer" as never })
    ).resolves.toBe(42n)
    expect(readState).toHaveBeenCalledTimes(1)
  })
})
