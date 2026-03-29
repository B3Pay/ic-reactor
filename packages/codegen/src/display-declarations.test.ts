import { describe, it, expect } from "vitest"
import { transformToDisplayDts } from "./generators/display-declarations"

// Sample standard .d.ts output from didToTs() for an ICRC1 ledger
const ICRC1_STANDARD_DTS = `import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

export interface Account {
  'owner' : Principal,
  'subaccount' : [] | [Subaccount],
}
export type BlockIndex = bigint;
export type Duration = bigint;
export interface InitArgs {
  'token_symbol' : string,
  'transfer_fee' : bigint,
  'metadata' : Array<[string, Value]>,
  'minting_account' : Account,
  'initial_balances' : Array<[Account, bigint]>,
  'archive_options' : {
    'num_blocks_to_archive' : bigint,
    'trigger_threshold' : bigint,
    'max_message_size_bytes' : [] | [bigint],
    'cycles_for_archive_creation' : [] | [bigint],
    'node_max_memory_size_bytes' : [] | [bigint],
    'controller_id' : Principal,
  },
  'token_name' : string,
}
export type LedgerArg = { 'Upgrade' : [] | [UpgradeArgs] } |
  { 'Init' : InitArgs };
export type Subaccount = Uint8Array | number[];
export type Timestamp = bigint;
export type Tokens = bigint;
export interface TransferArg {
  'to' : Account,
  'fee' : [] | [Tokens],
  'memo' : [] | [Uint8Array | number[]],
  'from_subaccount' : [] | [Subaccount],
  'created_at_time' : [] | [Timestamp],
  'amount' : Tokens,
}
export type TransferError = {
    'GenericError' : { 'message' : string, 'error_code' : bigint }
  } |
  { 'TemporarilyUnavailable' : null } |
  { 'BadBurn' : { 'min_burn_amount' : Tokens } } |
  { 'Duplicate' : { 'duplicate_of' : BlockIndex } } |
  { 'BadFee' : { 'expected_fee' : Tokens } } |
  { 'CreatedInFuture' : { 'ledger_time' : bigint } } |
  { 'TooOld' : null } |
  { 'InsufficientFunds' : { 'balance' : Tokens } };
export type TransferResult = { 'Ok' : BlockIndex } |
  { 'Err' : TransferError };
export type Value = { 'Int' : bigint } |
  { 'Nat' : bigint } |
  { 'Blob' : Uint8Array | number[] } |
  { 'Text' : string };
export interface _SERVICE {
  'icrc1_balance_of' : ActorMethod<[Account], Tokens>,
  'icrc1_decimals' : ActorMethod<[], number>,
  'icrc1_fee' : ActorMethod<[], Tokens>,
  'icrc1_metadata' : ActorMethod<[], Array<[string, Value]>>,
  'icrc1_minting_account' : ActorMethod<[], [] | [Account]>,
  'icrc1_name' : ActorMethod<[], string>,
  'icrc1_supported_standards' : ActorMethod<
    [],
    Array<{ 'url' : string, 'name' : string }>
  >,
  'icrc1_symbol' : ActorMethod<[], string>,
  'icrc1_total_supply' : ActorMethod<[], Tokens>,
  'icrc1_transfer' : ActorMethod<[TransferArg], TransferResult>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];`

// Simple .d.ts for basic canister
const SIMPLE_STANDARD_DTS = `import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

export interface _SERVICE { 'greet' : ActorMethod<[string], string> }
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];`

describe("Display Declarations Transform", () => {
  it("replaces Principal import with comment", () => {
    const result = transformToDisplayDts({ standardDts: SIMPLE_STANDARD_DTS })
    expect(result).not.toContain("import type { Principal }")
    expect(result).toContain(
      "// Display types: Principal is represented as string"
    )
  })

  it("transforms bigint to string", () => {
    const result = transformToDisplayDts({ standardDts: ICRC1_STANDARD_DTS })

    // Type aliases
    expect(result).toContain("export type BlockIndex = string;")
    expect(result).toContain("export type Tokens = string;")
    expect(result).toContain("export type Timestamp = string;")

    // Should NOT contain bigint anymore
    expect(result).not.toContain("bigint")
  })

  it("transforms Principal to string", () => {
    const result = transformToDisplayDts({ standardDts: ICRC1_STANDARD_DTS })

    // Record fields
    expect(result).toContain("'owner' : string")
    expect(result).toContain("'controller_id' : string")

    // Should NOT contain Principal type reference (only the comment)
    const lines = result.split("\n").filter((l) => !l.startsWith("//"))
    for (const line of lines) {
      expect(line).not.toMatch(/\bPrincipal\b/)
    }
  })

  it("transforms Candid opt pattern [] | [T] to T | undefined", () => {
    const result = transformToDisplayDts({ standardDts: ICRC1_STANDARD_DTS })

    // Simple optional: [] | [Tokens] → Tokens | undefined
    expect(result).toContain("'fee' : Tokens | undefined")

    // Optional in service: [] | [Account] → Account | undefined
    expect(result).toContain("Account | undefined")
  })

  it("transforms blob type Uint8Array | number[] to string | Uint8Array", () => {
    const result = transformToDisplayDts({ standardDts: ICRC1_STANDARD_DTS })

    // Subaccount type alias
    expect(result).toContain("export type Subaccount = string | Uint8Array;")

    // Should NOT contain the old blob pattern
    expect(result).not.toContain("Uint8Array | number[]")
  })

  it("adds _type discriminator to variant type declarations", () => {
    const result = transformToDisplayDts({ standardDts: ICRC1_STANDARD_DTS })

    // TransferResult variant
    expect(result).toContain("'_type' : 'Ok'")
    expect(result).toContain("'_type' : 'Err'")

    // TransferError variant with null members
    expect(result).toContain("{ '_type' : 'TooOld' }")
    expect(result).toContain("{ '_type' : 'TemporarilyUnavailable' }")

    // Variant members with values should keep the value
    expect(result).toContain("'_type' : 'BadFee'")
    expect(result).toContain("'_type' : 'GenericError'")
  })

  it("does NOT add _type to record fields inside interfaces", () => {
    const result = transformToDisplayDts({ standardDts: ICRC1_STANDARD_DTS })

    // The Account interface should NOT have _type
    const accountMatch = result.match(/export interface Account \{[\s\S]*?\}/)
    if (accountMatch) {
      expect(accountMatch[0]).not.toContain("_type")
    }
  })

  it("preserves simple service types unchanged", () => {
    const result = transformToDisplayDts({ standardDts: SIMPLE_STANDARD_DTS })

    // Simple string→string method should be unchanged
    expect(result).toContain("ActorMethod<[string], string>")
  })

  it("preserves ActorMethod, IDL imports and declarations", () => {
    const result = transformToDisplayDts({ standardDts: ICRC1_STANDARD_DTS })

    expect(result).toContain(
      "import type { ActorMethod } from '@icp-sdk/core/agent'"
    )
    expect(result).toContain("import type { IDL } from '@icp-sdk/core/candid'")
    expect(result).toContain("export declare const idlFactory")
    expect(result).toContain("export declare const init")
  })

  it("produces a full snapshot for ICRC1", () => {
    const result = transformToDisplayDts({ standardDts: ICRC1_STANDARD_DTS })
    expect(result).toMatchSnapshot("icrc1-display-declarations")
  })
})
