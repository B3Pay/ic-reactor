// Display hints the viewers read from names: which bigints are token amounts
// (shown in a ledger's units) and which are IC timestamps (shown as a UTC
// date beside the number). Names are only a hint, so the raw number is always
// one hover or one switch away.

function lastWord(name: string): string {
  const words = name.toLowerCase().split(/[^a-z0-9]+/)
  return words[words.length - 1] ?? ""
}

const AMOUNT_WORDS = new Set([
  "amount",
  "fee",
  "fees",
  "balance",
  "e8s",
  "allowance",
  "supply",
  "tokens",
])

/**
 * Whether a field holds a token amount: its last word is one of amount, fee,
 * balance, e8s, allowance, supply, tokens (`amount`, `minter_fee`,
 * `expected_allowance`, `icrc1:fee`, `e8s`), and not `fee_collector_block`.
 */
export function isAmountName(name: string): boolean {
  return AMOUNT_WORDS.has(lastWord(name))
}

/**
 * Whether a method's bare reply is a token amount: `icrc1_balance_of`,
 * `icrc1_total_supply`, `icrc1_fee`, `account_balance`. Not
 * `icrc1_transfer`, whose Ok payload is a block index.
 */
export function isAmountMethod(method: string): boolean {
  return /(^|_)(balance|balance_of|supply|total_supply|fee|allowance)(_|$)/i.test(
    method
  )
}

const TIME_WORDS = new Set(["time", "timestamp", "nanos", "at"])

// 1973-03-03 to 5138-11-16 in nanoseconds: an IC timestamp, not seconds or
// milliseconds, and not a small counter that happens to sit under `*_time`.
const MIN_NANOS = 100_000_000_000_000_000n
const MAX_NANOS = 100_000_000_000_000_000_000n

/**
 * Whether a field holds IC time in nanoseconds since the epoch:
 * `created_at_time`, `timestamp_nanos`, `expires_at`, `timestamp`, with a
 * value in a plausible range.
 */
export function isNanosTimestamp(name: string, value: bigint): boolean {
  return (
    TIME_WORDS.has(lastWord(name)) && value >= MIN_NANOS && value < MAX_NANOS
  )
}
