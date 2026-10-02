// The ICP ledger's blocks, archives included. The ledger keeps only its newest
// blocks; a `query_blocks` reply names an archive canister and method for each
// older range (a Candid func reference), and `client.func()` calls it. Plain
// TypeScript, so the Mainnet tab, scripts/smoke.ts and blocks.test.ts share it.
import type { Canister, Client, ReactorError } from "@ic-reactor/core"
import { queryOptions } from "@tanstack/react-query"
import {
  actor,
  QueryArchiveFn,
  type Actor,
  type ArchivedBlocksRange,
  type Block,
  type BlockRange,
  type GetBlocksArgs,
  type QueryArchiveError,
  type QueryBlocksResponse,
} from "./canisters/icp_ledger.ts"
import { ICP_LEDGER } from "./ledger.ts"

/** The ICP ledger, typed with its block-reading interface (icp_ledger.did). */
export type BlocksLedger = Canister<Actor>

/** The ICP ledger's blocks on `client`; `certified` certifies `query_blocks`. */
export const blocksLedgerOn = (client: Client, certified = false) =>
  client.canister<Actor>(actor, { id: ICP_LEDGER, certified })

/**
 * The function an archive callback stands for. A generated func type is only
 * `{ principal, method }`, so the signature is written here from the `.did`:
 * `func (GetBlocksArgs) -> (QueryArchiveResult) query`, whose `Ok` payload the
 * client resolves with and whose `Err` it rejects as `canister_err`.
 */
export type ReadArchive = (arg: GetBlocksArgs) => Promise<BlockRange>

/**
 * TanStack Query options for one archived range of a `query_blocks` reply:
 * `client.func()` turns the range's callback into a call to its archive
 * canister, and the result is cached like any read.
 *
 * There is no options builder for a func reference, so the key is the key of
 * the `query_blocks` read that named the range (`client.queryKey()`, which
 * holds the network, the caller and the ledger), plus the range. Keyed so, it
 * stays under its ledger: an invalidation of the ledger's reads covers it. The
 * call is made as the caller current when it runs, as a direct call is, and
 * the default `retry` of `client.queryClient` applies to it. TanStack's
 * `queryOptions()` tags the key with the data and the error, so `useQuery`
 * types `error` as a `ReactorError` whose `err` is a `QueryArchiveError`.
 *
 * @param args - The arguments of the `query_blocks` read whose reply carried
 * `range`.
 */
export function archivedRangeOptions(
  client: Client,
  ledger: BlocksLedger,
  args: GetBlocksArgs,
  range: ArchivedBlocksRange
) {
  const read = client.func<ReadArchive>(QueryArchiveFn, range.callback)
  return queryOptions<BlockRange, ReactorError<QueryArchiveError>>({
    queryKey: [
      ...client.queryKey(ledger, "query_blocks", args),
      "archived",
      range.callback.principal,
      range.callback.method,
      range.start.toString(),
      range.length.toString(),
    ],
    queryFn: () => read({ start: range.start, length: range.length }),
  })
}

/** A block, its index, and the canister that answered with it. */
export interface BlockRow {
  readonly index: bigint
  readonly block: Block
  /** The ledger's id, or the archive canister's for an archived block. */
  readonly from: string
}

/**
 * The blocks of a `query_blocks` reply in index order: those of each archived
 * range (from `archived[i]`, the read of `reply.archived_blocks[i]`, or
 * nothing while it is loading) and those the ledger itself sent.
 */
export function blockRows(
  reply: QueryBlocksResponse,
  archived: ReadonlyArray<BlockRange | undefined>
): BlockRow[] {
  const rows: BlockRow[] = []
  reply.archived_blocks.forEach((range, i) => {
    archived[i]?.blocks.forEach((block, offset) =>
      rows.push({
        index: range.start + BigInt(offset),
        block,
        from: range.callback.principal,
      })
    )
  })
  reply.blocks.forEach((block, offset) =>
    rows.push({
      index: reply.first_block_index + BigInt(offset),
      block,
      from: ICP_LEDGER,
    })
  )
  return rows.sort((a, b) =>
    a.index < b.index ? -1 : a.index > b.index ? 1 : 0
  )
}

/** What a block did, in a few words, with its amount in e8s. */
export function operationOf(block: Block): {
  readonly kind: string
  readonly e8s: bigint | undefined
} {
  const operation = block.transaction.operation
  if (operation === null) return { kind: "unknown", e8s: undefined }
  switch (operation.tag) {
    case "Mint":
      return { kind: "Mint", e8s: operation.value.amount.e8s }
    case "Burn":
      return { kind: "Burn", e8s: operation.value.amount.e8s }
    case "Transfer":
      return { kind: "Transfer", e8s: operation.value.amount.e8s }
    case "Approve":
      return { kind: "Approve", e8s: operation.value.allowance.e8s }
  }
}

/** A block's timestamp in UTC, to the second: `2021-05-06 19:17:10`. */
export const blockTime = (block: Block): string =>
  new Date(Number(block.timestamp.timestamp_nanos / 1_000_000n))
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, "")
