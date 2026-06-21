/**
 * Sample Candid definitions for the playground.
 */

export const SAMPLES: Record<string, { label: string; did: string }> = {
  icrc1: {
    label: "ICRC-1 Ledger",
    did: `type Account = record {
  owner : principal;
  subaccount : opt blob;
};

type TransferArg = record {
  to : Account;
  fee : opt nat;
  memo : opt blob;
  from_subaccount : opt blob;
  created_at_time : opt nat64;
  amount : nat;
};

type TransferError = variant {
  GenericError : record { message : text; error_code : nat };
  TemporarilyUnavailable;
  BadBurn : record { min_burn_amount : nat };
  Duplicate : record { duplicate_of : nat };
  BadFee : record { expected_fee : nat };
  CreatedInFuture : record { ledger_time : nat64 };
  TooOld;
  InsufficientFunds : record { balance : nat };
};

type TransferResult = variant {
  Ok : nat;
  Err : TransferError;
};

service : {
  icrc1_name : () -> (text) query;
  icrc1_symbol : () -> (text) query;
  icrc1_decimals : () -> (nat8) query;
  icrc1_fee : () -> (nat) query;
  icrc1_total_supply : () -> (nat) query;
  icrc1_balance_of : (Account) -> (nat) query;
  icrc1_transfer : (TransferArg) -> (TransferResult);
}`,
  },
  simple: {
    label: "Simple Greeter",
    did: `service : {
  greet : (text) -> (text) query;
  set_greeting : (text) -> ();
}`,
  },
  nft: {
    label: "NFT Collection",
    did: `type TokenId = nat;

type TokenMetadata = record {
  owner : principal;
  name : text;
  description : text;
  image_url : text;
  created_at : nat64;
};

type MintResult = variant {
  Ok : TokenId;
  Err : text;
};

type TransferArgs = record {
  token_id : TokenId;
  to : principal;
};

service : {
  mint : (TokenMetadata) -> (MintResult);
  transfer : (TransferArgs) -> (MintResult);
  owner_of : (TokenId) -> (opt principal) query;
  metadata : (TokenId) -> (opt TokenMetadata) query;
  total_supply : () -> (nat) query;
  balance_of : (principal) -> (nat) query;
}`,
  },
  dao: {
    label: "DAO Governance",
    did: `type ProposalId = nat;

type ProposalStatus = variant {
  Open;
  Accepted;
  Rejected;
  Executed;
};

type Proposal = record {
  id : ProposalId;
  title : text;
  description : text;
  proposer : principal;
  status : ProposalStatus;
  yes_votes : nat;
  no_votes : nat;
  created_at : nat64;
};

type Vote = variant {
  Yes;
  No;
};

type VoteResult = variant {
  Ok;
  Err : text;
};

service : {
  create_proposal : (text, text) -> (ProposalId);
  vote : (ProposalId, Vote) -> (VoteResult);
  get_proposal : (ProposalId) -> (opt Proposal) query;
  list_proposals : () -> (vec Proposal) query;
}`,
  },
}
