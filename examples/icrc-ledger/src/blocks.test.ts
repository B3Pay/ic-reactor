// The Blocks section's reads, over the in-memory replica: a mocked ICP ledger
// whose oldest blocks live in a mocked archive canister, reached through the
// func reference the ledger's reply carries, as on mainnet.
import { c, principal } from "@candid-core/schema"
import { isReactorError, type ReactorError } from "@ic-reactor/core"
import { createTestClient, type TestHandlers } from "@ic-reactor/core/testing"
import { afterEach, describe, expect, it } from "vitest"
import {
  archivedRangeOptions,
  blockRows,
  blocksLedgerOn,
  operationOf,
} from "./blocks.ts"
import {
  actor,
  QueryArchiveFn,
  type Actor,
  type Block,
  type GetBlocksArgs,
  type QueryArchiveResult,
} from "./canisters/icp_ledger.ts"
import { ICP_LEDGER } from "./ledger.ts"

/** The ICP ledger's first archive canister on mainnet. */
const ARCHIVE = "qjdve-lqaaa-aaaaa-aaaeq-cai"
/** Blocks 0 to 5 are archived; the ledger holds 6 to 9. */
const ARCHIVED = 6n
const CHAIN = 10n

/** The block at `index`: a mint of `index` ICP. */
const blockAt = (index: bigint): Block => ({
  parent_hash: null,
  timestamp: { timestamp_nanos: 1_620_000_000_000_000_000n + index },
  transaction: {
    memo: index,
    icrc1_memo: null,
    created_at_time: { timestamp_nanos: 0n },
    operation: {
      tag: "Mint",
      value: { to: new Uint8Array(32), amount: { e8s: index * 100_000_000n } },
    },
  },
})

const range = (from: bigint, to: bigint): Block[] => {
  const blocks: Block[] = []
  for (let i = from; i < to; i++) blocks.push(blockAt(i))
  return blocks
}

const min = (a: bigint, b: bigint) => (a < b ? a : b)
const max = (a: bigint, b: bigint) => (a > b ? a : b)

/**
 * The archive canister's interface is the func type's own: a service whose
 * one method is `QueryArchiveFn`, served under the name the callback gives.
 */
const archiveService = c.service({ get_blocks: QueryArchiveFn })
type ArchiveActor = {
  get_blocks: (arg: GetBlocksArgs) => Promise<QueryArchiveResult>
}

const clients: Array<{ dispose(): void }> = []
afterEach(() => {
  for (const client of clients.splice(0)) client.dispose()
})

/**
 * A test client with the ledger and its archive mocked. The archive holds
 * blocks from `archiveFrom` on, and answers `BadFirstBlockIndex` below it.
 */
function setup(archiveFrom = 0n) {
  const test = createTestClient()
  clients.push(test.client)
  const ledgerHandlers: TestHandlers<Actor> = {
    query_blocks: ({ start, length }) => {
      const end = min(start + length, CHAIN)
      const archivedEnd = min(end, ARCHIVED)
      return {
        chain_length: CHAIN,
        certificate: null,
        first_block_index: max(start, ARCHIVED),
        blocks: range(max(start, ARCHIVED), end),
        archived_blocks:
          start < archivedEnd
            ? [
                {
                  start,
                  length: archivedEnd - start,
                  callback: {
                    principal: principal(ARCHIVE),
                    method: "get_blocks",
                  },
                },
              ]
            : [],
      }
    },
  }
  const archiveHandlers: TestHandlers<ArchiveActor> = {
    get_blocks: ({ start, length }) =>
      start < archiveFrom
        ? {
            tag: "Err",
            value: {
              tag: "BadFirstBlockIndex",
              value: { requested_index: start, first_valid_index: archiveFrom },
            },
          }
        : { tag: "Ok", value: { blocks: range(start, start + length) } },
  }
  test.mock<Actor>(actor, ICP_LEDGER, ledgerHandlers)
  test.mock<ArchiveActor>(archiveService, ARCHIVE, archiveHandlers)
  return { ...test, ledger: blocksLedgerOn(test.client) }
}

/** The queries the replica received for the archive canister. */
const archiveReads = (requests: ReturnType<typeof setup>["requests"]) =>
  requests.filter((r) => r.endpoint === "query" && r.canisterId === ARCHIVE)

describe("reading the ICP ledger's blocks across its archive", () => {
  it("reads the archived part of a range from the canister and method the reply's callback names", async () => {
    const { client, ledger, requests } = setup()
    const args = { start: 4n, length: 4n }

    const reply = await client.queryClient.fetchQuery(
      client.queryOptions(ledger, "query_blocks", args)
    )
    expect(reply.archived_blocks).toEqual([
      {
        start: 4n,
        length: 2n,
        callback: { principal: ARCHIVE, method: "get_blocks" },
      },
    ])
    const archived = await Promise.all(
      reply.archived_blocks.map((r) =>
        client.queryClient.fetchQuery(
          archivedRangeOptions(client, ledger, args, r)
        )
      )
    )

    const rows = blockRows(reply, archived)
    expect(rows.map((row) => [row.index, row.from])).toEqual([
      [4n, ARCHIVE],
      [5n, ARCHIVE],
      [6n, ICP_LEDGER],
      [7n, ICP_LEDGER],
    ])
    expect(rows.map((row) => operationOf(row.block))).toEqual([
      { kind: "Mint", e8s: 400_000_000n },
      { kind: "Mint", e8s: 500_000_000n },
      { kind: "Mint", e8s: 600_000_000n },
      { kind: "Mint", e8s: 700_000_000n },
    ])
    expect(archiveReads(requests).map((r) => r.methodName)).toEqual([
      "get_blocks",
    ])
  })

  it("sends nothing to an archive when the ledger still holds the whole range", async () => {
    const { client, ledger, requests } = setup()

    const reply = await client.queryClient.fetchQuery(
      client.queryOptions(ledger, "query_blocks", { start: 7n, length: 3n })
    )

    expect(reply.archived_blocks).toEqual([])
    expect(blockRows(reply, []).map((row) => row.index)).toEqual([7n, 8n, 9n])
    expect(archiveReads(requests)).toHaveLength(0)
  })

  it("rejects an archive's Err arm as canister_err, with the QueryArchiveError in err", async () => {
    const { client, ledger } = setup(2n)
    const args = { start: 0n, length: 3n }
    const reply = await ledger.query_blocks(args)
    const [only] = reply.archived_blocks
    expect(only).toBeDefined()

    let failure: ReactorError<unknown> | undefined
    try {
      await client.queryClient.fetchQuery(
        archivedRangeOptions(client, ledger, args, only!)
      )
    } catch (error) {
      if (!isReactorError(error)) throw error
      failure = error
    }

    expect(failure?.kind).toBe("canister_err")
    expect(failure?.mayHaveExecuted).toBe(false)
    expect(failure?.err).toEqual({
      tag: "BadFirstBlockIndex",
      value: { requested_index: 0n, first_valid_index: 2n },
    })
  })

  it("caches an archived range under the ledger's key, so a ledger invalidation reaches it", async () => {
    const { client, ledger, requests } = setup()
    const args = { start: 0n, length: 2n }
    const reply = await ledger.query_blocks(args)
    const options = archivedRangeOptions(
      client,
      ledger,
      args,
      reply.archived_blocks[0]!
    )

    await client.queryClient.fetchQuery({ ...options, staleTime: Infinity })
    await client.queryClient.fetchQuery({ ...options, staleTime: Infinity })
    expect(archiveReads(requests)).toHaveLength(1)

    await client.queryClient.invalidateQueries({
      queryKey: client.queryKey(ledger),
    })
    expect(
      client.queryClient.getQueryState(options.queryKey)?.isInvalidated
    ).toBe(true)
  })
})
