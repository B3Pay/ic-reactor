import { ClientManager } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { describe, expect, it, vi } from "vitest"
import { CandidReactor } from "../../src/reactor.js"
import { CandidDisplayReactor } from "../../src/display-reactor.js"
import { importCandidDefinition } from "../../src/utils.js"

/**
 * importCandidDefinition turns the compiled `export const idlFactory = …`
 * into a plain declaration by rewriting the text. It rewrote every match, also
 * inside the string literals that hold Candid names, so a field named
 * "export const x = 1" became "const x = 1": another hash on the wire, and a
 * call the canister rejects (or, for an optional field, reads as none).
 */

const NAMES = ["export const x = 1", "export function f", "plain"]
const CANDID = `service : {
  set : (record { "export const x = 1" : nat; "export function f" : opt nat; plain : nat }) -> ();
}`
const ARG = IDL.Record({
  "export const x = 1": IDL.Nat,
  "export function f": IDL.Opt(IDL.Nat),
  plain: IDL.Nat,
})
const VALUE = { "export const x = 1": 1n, "export function f": [2n], plain: 3n }

function createMockClientManager(): ClientManager {
  const agent = HttpAgent.createSync({ host: "https://ic0.app" })
  return {
    agent,
    registerCanisterId: () => {},
    subscribe: () => () => {},
    queryClient: {
      invalidateQueries: () => Promise.resolve(),
      ensureQueryData: () => Promise.resolve(undefined),
      getQueryData: () => undefined,
    },
  } as unknown as ClientManager
}

function argFieldNames(service: IDL.ServiceClass): string[] {
  const set = service._fields.find(([name]) => name === "set")?.[1]
  const record = set?.argTypes[0]
  if (!(record instanceof IDL.RecordClass)) {
    throw new Error(`expected a record, got ${record?.display()}`)
  }
  return record._fields.map(([name]) => name).sort()
}

/** The bytes callMethod hands to the agent. */
async function sentBytes(
  reactor: CandidReactor | CandidDisplayReactor,
  args: unknown[]
): Promise<Uint8Array> {
  const send = vi
    .spyOn(reactor as any, "executeCall")
    .mockResolvedValue(IDL.encode([], []))
  await reactor.callMethod({ functionName: "set", args } as never)
  return send.mock.calls[0][1] as Uint8Array
}

describe("a Candid name that reads like an export statement", () => {
  it("is kept by importCandidDefinition", async () => {
    const js = `export const idlFactory = ({ IDL }) => {
  return IDL.Service({
    'set' : IDL.Func(
        [IDL.Record({ 'export const x = 1' : IDL.Nat, 'export function f' : IDL.Opt(IDL.Nat), 'plain' : IDL.Nat })],
        [],
        [],
      ),
  });
};
export const init = ({ IDL }) => { return []; };`
    const { idlFactory, init } = await importCandidDefinition(js)

    expect(argFieldNames(idlFactory({ IDL }))).toEqual(NAMES)
    expect(init?.({ IDL })).toEqual([])
  })

  it("goes on the wire under its own hash from CandidReactor", async () => {
    const reactor = new CandidReactor({
      name: "names",
      canisterId: "aaaaa-aa",
      clientManager: createMockClientManager(),
      candid: CANDID,
    })
    await reactor.initialize()

    expect(argFieldNames(reactor.getServiceInterface())).toEqual(NAMES)
    expect(await sentBytes(reactor, [VALUE])).toEqual(
      IDL.encode([ARG], [VALUE])
    )
  })

  it("goes on the wire under its own hash from CandidDisplayReactor", async () => {
    const reactor = new CandidDisplayReactor({
      name: "names",
      canisterId: "aaaaa-aa",
      clientManager: createMockClientManager(),
      candid: CANDID,
    })
    await reactor.initialize()

    const display = {
      "export const x = 1": "1",
      "export function f": "2",
      plain: "3",
    }
    expect(await sentBytes(reactor, [display])).toEqual(
      IDL.encode([ARG], [VALUE])
    )
  })
})
