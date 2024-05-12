import type { Principal } from "@dfinity/principal"
import type { ActorMethod } from "@dfinity/agent"
import type { IDL } from "@dfinity/candid"

export interface Account {
  owner: Principal
  subaccount: [] | [Uint8Array | number[]]
}
export interface GetBlocksArgs {
  start: bigint
  length: bigint
}
export interface BlockRange {
  blocks: Array<CandidBlock>
}
export interface Tokens {
  e8s: bigint
}
export interface TimeStamp {
  timestamp_nanos: bigint
}
export interface CandidBlock {
  transaction: CandidTransaction
  timestamp: TimeStamp
  parent_hash: [] | [Uint8Array | number[]]
}
export type CandidOperation =
  | {
      Approve: {
        fee: Tokens
        from: Uint8Array | number[]
        allowance_e8s: bigint
        allowance: Tokens
        expected_allowance: [] | [Tokens]
        expires_at: [] | [TimeStamp]
        spender: Uint8Array | number[]
      }
    }
  | {
      Burn: {
        from: Uint8Array | number[]
        amount: Tokens
        spender: [] | [Uint8Array | number[]]
      }
    }
  | { Mint: { to: Uint8Array | number[]; amount: Tokens } }
  | {
      Transfer: {
        to: Uint8Array | number[]
        fee: Tokens
        from: Uint8Array | number[]
        amount: Tokens
        spender: [] | [Uint8Array | number[]]
      }
    }
export interface CandidTransaction {
  memo: bigint
  icrc1_memo: [] | [Uint8Array | number[]]
  operation: [] | [CandidOperation]
  created_at_time: TimeStamp
}
export interface QueryBlocksResponse {
  certificate: [] | [Uint8Array | number[]]
  blocks: Array<CandidBlock>
  chain_length: bigint
  first_block_index: bigint
  archived_blocks: Array<ArchivedBlocksRange>
}
export interface ArchivedBlocksRange {
  callback: [Principal, string]
  start: bigint
  length: bigint
}
export interface _SERVICE {
  query_blocks: ActorMethod<[GetBlocksArgs], QueryBlocksResponse>
}
export declare const idlFactory: IDL.InterfaceFactory
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[]
