// The tests' stand-in for mainnet: a real client from `createTestClient()`
// (`@ic-reactor/core/testing`) over an in-memory replica, with the three
// ledgers and the not-a-ledger canister of src/ledgers.ts mocked at their real
// ids. Each call makes a new client and replica, so a test builds one for the
// server's request and another for the browser tab, as the app has.
//
// The mocked values include what JSON cannot carry: amounts past 2^53, a
// negative `int`, a 32-byte subaccount and a `Blob` metadata entry, so that a
// test sees them come back exactly after dehydration. `icrc1_name` answers
// with the caller it saw, so a test can tell whose read a card shows.
import { principal, type Principal } from "@candid-core/schema"
import { createTestClient, type TestHandlers } from "@ic-reactor/core/testing"
import { actor, type Account, type Actor } from "@/canisters/icrc1"
import { LEDGERS, NOT_A_LEDGER, SAMPLE_OWNER, type LedgerRef } from "@/ledgers"

export const ANONYMOUS = principal("2vxsx-fae")
/** The principals of the test identities of seeds 1 and 2. */
export const SEED_1 = principal(
  "psith-oknjz-x73tv-7x3p4-a2sji-7o6lo-g2754-yfgfl-3vlqe-irrrt-4ae"
)
export const SEED_2 = principal(
  "xledz-fktfc-4ywwn-gai5u-ieqce-5x4qc-7lpel-o4ubn-ucngz-7lrzo-5ae"
)

/** What each mocked ledger answers; `supply` is past 2^53 on purpose. */
export interface MockToken {
  readonly name: string
  readonly symbol: string
  readonly decimals: number
  readonly fee: bigint
  readonly supply: bigint
  readonly minter: Account
  readonly blob: Uint8Array
}

const MINTER = principal("rrkah-fqaaa-aaaaa-aaaaq-cai")

/** The mocked token of each ledger of src/ledgers.ts, by canister id. */
export const TOKENS: ReadonlyMap<string, MockToken> = new Map(
  LEDGERS.map((ledger, index) => [
    ledger.id,
    {
      name: `${ledger.label} test ledger`,
      symbol: ledger.label,
      decimals: ledger.label === "ckETH" ? 18 : 8,
      fee: 10_000n + BigInt(index),
      supply: 2n ** 70n + BigInt(index),
      minter: {
        owner: MINTER,
        subaccount: new Uint8Array(32).fill(index + 1),
      },
      blob: new Uint8Array([0, 1, 127, 128, 254, 255, index]),
    },
  ])
)

/** The balance of each owner's default account, on every mocked ledger. */
export const BALANCES: ReadonlyMap<Principal, bigint> = new Map([
  [principal(SAMPLE_OWNER), 12_345_678_901_234_567_890_123n],
  [SEED_1, 150_000_000n],
  [SEED_2, 42n],
])

export const tokenOf = (ledger: LedgerRef): MockToken => {
  const token = TOKENS.get(ledger.id)
  if (token === undefined) throw new Error(`no mocked token for ${ledger.id}`)
  return token
}

function handlersFor(token: MockToken): TestHandlers<Actor> {
  return {
    icrc1_name: (ctx) => `${token.name}, read by ${ctx.caller}`,
    icrc1_symbol: () => token.symbol,
    icrc1_decimals: () => token.decimals,
    icrc1_fee: () => token.fee,
    icrc1_total_supply: () => token.supply,
    icrc1_minting_account: () => token.minter,
    icrc1_metadata: () => [
      ["icrc1:fee", { tag: "Nat", value: token.fee }],
      ["test:int", { tag: "Int", value: -(2n ** 64n) }],
      ["test:blob", { tag: "Blob", value: token.blob }],
    ],
    icrc1_balance_of: ({ owner, subaccount }) =>
      subaccount === null ? (BALANCES.get(owner) ?? 0n) : 0n,
  }
}

/**
 * A test client over a replica that runs the mocked ledgers, and NNS
 * governance at its real id with none of their methods (every read of it
 * traps, reject code 5, as on mainnet).
 *
 * @param options.signedIn - Whether the client starts signed in as seed 1.
 * The server's client and a visitor's first load are not.
 */
export function mockLedgers(options: { signedIn?: boolean } = {}) {
  const test = createTestClient({
    network: "ic",
    identity: 1,
    signedIn: options.signedIn ?? false,
  })
  for (const ledger of LEDGERS) {
    test.mock<Actor>(actor, ledger.id, handlersFor(tokenOf(ledger)))
  }
  test.mock<Actor>(actor, NOT_A_LEDGER.id, {})
  return test
}

/** A test client and its replica, as `mockLedgers()` returns them. */
export type MockLedgers = ReturnType<typeof mockLedgers>

/** The requests a test client's replica answered for `method`, if any. */
export const requestsFor = (test: MockLedgers, method: string) =>
  test.requests.filter((request) => request.methodName === method)
