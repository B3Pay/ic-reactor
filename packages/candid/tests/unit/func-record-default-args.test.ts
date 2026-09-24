import { ClientManager } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { describe, expect, it, vi } from "vitest"
import { MetadataDisplayReactor } from "../../src/metadata-display-reactor.js"
import { MetadataReactor } from "../../src/metadata-reactor.js"
import { ResultFieldVisitor } from "../../src/visitor/returns/index.js"
import type {
  FuncRecordNode,
  RecordNode,
  ResolvedNode,
  VectorNode,
} from "../../src/visitor/returns/index.js"

/**
 * A func record, a record holding one callback and the values to call it
 * with, resolves with `defaultArgs` for `callMethod({ args: defaultArgs })`.
 * They were display types on both metadata reactors, so on the candid-native
 * MetadataReactor, the reactor its options recommend for func-record
 * callbacks, that call threw "Invalid nat64 argument" (#611). They are now in
 * the type space of the reactor that resolved the record.
 */

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

/** The spy on a reactor's query transport, answering with `reply`. */
function answerQueries(reactor: object, reply: Uint8Array) {
  return vi
    .spyOn(
      reactor as unknown as {
        executeQuery: (...args: unknown[]) => Promise<Uint8Array>
      },
      "executeQuery"
    )
    .mockResolvedValue(reply)
}

/** The argument bytes of the `index`th query the spy saw. */
function sentArgs(spy: ReturnType<typeof answerQueries>, index = 0) {
  return spy.mock.calls[index][1] as Uint8Array
}

const archiveId = Principal.fromText("nbsys-saaaa-aaaar-qaaga-cai")

// icrc3_get_blocks as ICRC-3 ledgers such as ckBTC declare it. The callback
// takes `vec GetBlocksArgs`, the type of the `args` field beside it.
const ICRC3_CANDID = `
  type GetBlocksArgs = record { start : nat; length : nat };
  type Value = variant { Nat : nat; Text : text; Array : vec Value };
  type GetBlocksResult = record {
    log_length : nat;
    blocks : vec record { id : nat; block : Value };
    archived_blocks : vec record {
      args : vec GetBlocksArgs;
      callback : func (vec GetBlocksArgs) -> (GetBlocksResult) query;
    };
  };
  service : {
    icrc3_get_blocks : (vec GetBlocksArgs) -> (GetBlocksResult) query;
  }
`

// query_blocks in the ICP ledger's layout: the callback takes
// `record { start; length }`, and those two fields sit beside it.
const ICP_LEDGER_CANDID = `
  type GetBlocksArgs = record { start : nat64; length : nat64 };
  type BlockRange = record { blocks : vec record { memo : nat64 } };
  type QueryArchiveFn = func (GetBlocksArgs) -> (
    variant { Ok : BlockRange; Err : text }
  ) query;
  type QueryBlocksResponse = record {
    chain_length : nat64;
    archived_blocks : vec record {
      start : nat64;
      length : nat64;
      callback : QueryArchiveFn;
    };
  };
  service : {
    query_blocks : (GetBlocksArgs) -> (QueryBlocksResponse) query;
  }
`

// A streaming strategy whose token holds a principal, a nat, optionals, a
// variant and a tuple: the shapes where Candid and display values differ.
const STREAMING_CANDID = `
  type Token = record {
    key : text;
    index : nat;
    owner : opt principal;
    tags : opt vec text;
    mode : variant { Full; Range : record { nat32; nat32 } };
  };
  type Strategy = record {
    token : Token;
    callback : func (Token) -> (record { body : blob; token : opt Token }) query;
  };
  service : { get_strategy : () -> (Strategy) query }
`

const TOKEN = {
  key: "index.html",
  index: 7n,
  owner: [Principal.fromText("aaaaa-aa")],
  // An enabled but empty `opt vec`, which display values cannot hold.
  tags: [[]],
  mode: { Range: [1, 2] },
}

async function create<R extends MetadataReactor | MetadataDisplayReactor>(
  Reactor: new (config: {
    name: string
    canisterId: string
    clientManager: ClientManager
    candid: string
  }) => R,
  candid: string
): Promise<R> {
  const reactor = new Reactor({
    name: "ledger",
    canisterId: "mxzaz-hqaaa-aaaar-qaada-cai",
    clientManager: createMockClientManager(),
    candid,
  })
  await reactor.initialize()
  return reactor
}

function funcRecordOf(
  reactor: MetadataReactor | MetadataDisplayReactor,
  methodName: string
): IDL.FuncClass {
  const service = reactor.getServiceInterface()
  const field = service._fields.find(([name]) => name === methodName)
  if (!field) throw new Error(`No method ${methodName}`)
  return field[1] as IDL.FuncClass
}

describe("MetadataReactor func-record defaultArgs", () => {
  it("are Candid values the archive reactor can be called with (ICRC-3)", async () => {
    const ledger = await create(MetadataReactor, ICRC3_CANDID)
    const getBlocks = funcRecordOf(ledger, "icrc3_get_blocks")
    answerQueries(
      ledger,
      IDL.encode(getBlocks.retTypes, [
        {
          log_length: 10n,
          blocks: [],
          archived_blocks: [
            {
              args: [{ start: 0n, length: 2n }],
              callback: [archiveId, "icrc3_get_blocks"],
            },
          ],
        },
      ])
    )

    const result = await ledger.callMethod({
      functionName: "icrc3_get_blocks",
      args: [[{ start: 0n, length: 2n }]],
    })
    const blocks = (result.results[0] as { inner: RecordNode }).inner
    const archived = (blocks.fields.archived_blocks as VectorNode)
      .items[0] as FuncRecordNode
    expect(archived.type).toBe("funcRecord")
    expect(archived.defaultArgs).toEqual([[{ start: 0n, length: 2n }]])

    const archive = new MetadataReactor({
      name: "ckbtc-archive",
      canisterId: archived.canisterId,
      clientManager: createMockClientManager(),
      funcClass: { methodName: archived.methodName, func: archived.funcClass },
    })
    const archiveQuery = answerQueries(
      archive,
      IDL.encode(archived.funcClass.retTypes, [
        { log_length: 10n, blocks: [], archived_blocks: [] },
      ])
    )

    await archive.callMethod({
      functionName: archived.methodName as never,
      args: archived.defaultArgs as never,
    })

    expect(
      IDL.decode(archived.funcClass.argTypes, sentArgs(archiveQuery))
    ).toEqual([[{ start: 0n, length: 2n }]])
  })

  it("are Candid values the archive reactor can be called with (ICP ledger)", async () => {
    const ledger = await create(MetadataReactor, ICP_LEDGER_CANDID)
    const queryBlocks = funcRecordOf(ledger, "query_blocks")
    answerQueries(
      ledger,
      IDL.encode(queryBlocks.retTypes, [
        {
          chain_length: 100n,
          archived_blocks: [
            { start: 5n, length: 3n, callback: [archiveId, "get_blocks"] },
          ],
        },
      ])
    )

    const result = await ledger.callMethod({
      functionName: "query_blocks",
      args: [{ start: 0n, length: 10n }],
    })
    const response = result.results[0] as RecordNode
    const archived = (response.fields.archived_blocks as VectorNode)
      .items[0] as FuncRecordNode
    expect(archived.defaultArgs).toEqual([{ start: 5n, length: 3n }])

    const archive = new MetadataReactor({
      name: "icp-archive",
      canisterId: archived.canisterId,
      clientManager: createMockClientManager(),
      funcClass: { methodName: archived.methodName, func: archived.funcClass },
    })
    const archiveQuery = answerQueries(
      archive,
      IDL.encode(archived.funcClass.retTypes, [{ Ok: { blocks: [] } }])
    )

    await expect(
      archive.callMethod({
        functionName: archived.methodName as never,
        args: archived.defaultArgs as never,
      })
    ).resolves.toBeDefined()
    expect(
      IDL.decode(archived.funcClass.argTypes, sentArgs(archiveQuery))
    ).toEqual([{ start: 5n, length: 3n }])
  })

  it("keep principals, optionals, variants and tuples in their Candid form", async () => {
    const reactor = await create(MetadataReactor, STREAMING_CANDID)
    const getStrategy = funcRecordOf(reactor, "get_strategy")
    answerQueries(
      reactor,
      IDL.encode(getStrategy.retTypes, [
        { token: TOKEN, callback: [archiveId, "http_streaming"] },
      ])
    )

    const result = await reactor.callMethod({
      functionName: "get_strategy",
      args: [],
    })
    const strategy = result.results[0] as FuncRecordNode

    expect(strategy.defaultArgs).toEqual([TOKEN])
    // They encode as the callback's arguments and decode to the same token.
    const bytes = IDL.encode(
      strategy.funcClass.argTypes,
      strategy.defaultArgs as unknown[]
    )
    expect(IDL.decode(strategy.funcClass.argTypes, bytes)).toEqual([TOKEN])
  })
})

describe("MetadataDisplayReactor func-record defaultArgs", () => {
  it("stay display types, which its callMethod takes", async () => {
    const ledger = await create(MetadataDisplayReactor, ICP_LEDGER_CANDID)
    const queryBlocks = funcRecordOf(ledger, "query_blocks")
    answerQueries(
      ledger,
      IDL.encode(queryBlocks.retTypes, [
        {
          chain_length: 100n,
          archived_blocks: [
            { start: 5n, length: 3n, callback: [archiveId, "get_blocks"] },
          ],
        },
      ])
    )

    const result = await ledger.callMethod({
      functionName: "query_blocks",
      args: [{ start: "0", length: "10" }],
    })
    const response = result.results[0] as RecordNode
    const archived = (response.fields.archived_blocks as VectorNode)
      .items[0] as FuncRecordNode
    expect(archived.defaultArgs).toEqual([{ start: "5", length: "3" }])
  })
})

describe("ResultFieldVisitor defaultArgs option", () => {
  const Token = IDL.Record({ start: IDL.Nat64, owner: IDL.Opt(IDL.Principal) })
  const Callback = IDL.Record({
    token: Token,
    callback: IDL.Func([Token], [], ["query"]),
  })
  const value = {
    token: { start: 3n, owner: [archiveId] },
    callback: [archiveId, "next"],
  }

  function resolveWith(visitor: ResultFieldVisitor) {
    const node = Callback.accept(visitor, "strategy") as FuncRecordNode
    return (node.resolve(value) as ResolvedNode<"funcRecord">).defaultArgs
  }

  it("gives display types by default", () => {
    expect(resolveWith(new ResultFieldVisitor())).toEqual([
      { start: "3", owner: archiveId.toText() },
    ])
  })

  it('gives Candid values with defaultArgs: "candid"', () => {
    expect(
      resolveWith(new ResultFieldVisitor({ defaultArgs: "candid" }))
    ).toEqual([{ start: 3n, owner: [archiveId] }])
  })
})
