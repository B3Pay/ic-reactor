export const idlFactory = ({ IDL }) => {
  const Account = IDL.Record({
    owner: IDL.Principal,
    subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
  })
  const Tokens = IDL.Record({ e8s: IDL.Nat64 })
  const GetBlocksArgs = IDL.Record({
    start: IDL.Nat64,
    length: IDL.Nat64,
  })
  const TimeStamp = IDL.Record({ timestamp_nanos: IDL.Nat64 })
  const CandidOperation = IDL.Variant({
    Approve: IDL.Record({
      fee: Tokens,
      from: IDL.Vec(IDL.Nat8),
      allowance_e8s: IDL.Int,
      allowance: Tokens,
      expected_allowance: IDL.Opt(Tokens),
      expires_at: IDL.Opt(TimeStamp),
      spender: IDL.Vec(IDL.Nat8),
    }),
    Burn: IDL.Record({
      from: IDL.Vec(IDL.Nat8),
      amount: Tokens,
      spender: IDL.Opt(IDL.Vec(IDL.Nat8)),
    }),
    Mint: IDL.Record({ to: IDL.Vec(IDL.Nat8), amount: Tokens }),
    Transfer: IDL.Record({
      to: IDL.Vec(IDL.Nat8),
      fee: Tokens,
      from: IDL.Vec(IDL.Nat8),
      amount: Tokens,
      spender: IDL.Opt(IDL.Vec(IDL.Nat8)),
    }),
  })
  const CandidTransaction = IDL.Record({
    memo: IDL.Nat64,
    icrc1_memo: IDL.Opt(IDL.Vec(IDL.Nat8)),
    operation: IDL.Opt(CandidOperation),
    created_at_time: TimeStamp,
  })
  const CandidBlock = IDL.Record({
    transaction: CandidTransaction,
    timestamp: TimeStamp,
    parent_hash: IDL.Opt(IDL.Vec(IDL.Nat8)),
  })
  const BlockRange = IDL.Record({ blocks: IDL.Vec(CandidBlock) })
  const GetBlocksError = IDL.Variant({
    BadFirstBlockIndex: IDL.Record({
      requested_index: IDL.Nat64,
      first_valid_index: IDL.Nat64,
    }),
    Other: IDL.Record({
      error_message: IDL.Text,
      error_code: IDL.Nat64,
    }),
  })
  const Result_3 = IDL.Variant({ Ok: BlockRange, Err: GetBlocksError })
  const ArchivedBlocksRange = IDL.Record({
    callback: IDL.Func([GetBlocksArgs], [Result_3], ["query"]),
    start: IDL.Nat64,
    length: IDL.Nat64,
  })
  const QueryBlocksResponse = IDL.Record({
    certificate: IDL.Opt(IDL.Vec(IDL.Nat8)),
    blocks: IDL.Vec(CandidBlock),
    chain_length: IDL.Nat64,
    first_block_index: IDL.Nat64,
    archived_blocks: IDL.Vec(ArchivedBlocksRange),
  })
  return IDL.Service({
    icrc1_balance_of: IDL.Func([Account], [IDL.Nat], ["query"]),
    query_blocks: IDL.Func([GetBlocksArgs], [QueryBlocksResponse], ["query"]),
  })
}
