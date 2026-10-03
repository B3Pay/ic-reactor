// The ICP ledger's token (symbol, decimals and fee), read from the ledger, and
// how amounts are shown. Amounts are base units (`bigint`), turned into text
// only by `formatUnits` and read from text only by `parseUnits`, never through
// `Number()`.
import { formatUnits } from "@ic-reactor/core"
import { useAuth, useClient } from "@ic-reactor/react"
import { useQuery } from "@tanstack/react-query"
import { useCanisters } from "./use-canisters.ts"

export interface Token {
  readonly symbol: string
  readonly decimals: number
  /** The ledger's transfer fee, in base units. */
  readonly fee: bigint
}

/** `units` of `token`, as a person reads them: `1.5 ICP`. */
export const showAmount = (units: bigint, token: Token): string =>
  `${formatUnits(units, token.decimals)} ${token.symbol}`

/** A long principal cut to its ends: `ab2cd…xyz`. */
export const shortPrincipal = (text: string): string =>
  text.length > 16 ? `${text.slice(0, 5)}…${text.slice(-3)}` : text

/** The ledger's token, once its three reads have answered. */
export function useToken(): Token | undefined {
  const client = useClient()
  const { ledger } = useCanisters()
  // The options below are built for this render's caller, so this hook
  // renders again when the caller changes.
  useAuth()
  // A token's symbol and decimals never change: read once per caller, kept.
  const symbol = useQuery({
    ...client.queryOptions(ledger, "icrc1_symbol"),
    staleTime: Infinity,
  })
  const decimals = useQuery({
    ...client.queryOptions(ledger, "icrc1_decimals"),
    staleTime: Infinity,
  })
  const fee = useQuery(client.queryOptions(ledger, "icrc1_fee"))
  if (
    symbol.data === undefined ||
    decimals.data === undefined ||
    fee.data === undefined
  ) {
    return undefined
  }
  return { symbol: symbol.data, decimals: decimals.data, fee: fee.data }
}
