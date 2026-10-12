import { getRouteApi } from "@tanstack/react-router"
import type { TokenUnits } from "../../lib/format.ts"
import type { RegistryEntry } from "../../lib/registry.ts"
import { useCanisterInterface } from "../../interface/load.ts"
import type {
  CanisterInterface,
  InterfacePayload,
} from "../../interface/types.ts"

const canisterRoute = getRouteApi("/canister/$canisterId")

/**
 * The canister layout's interface, for its child pages: the payload its
 * loader returned and the interface rebuilt from it (the same object as the
 * layout's, memoized by the interface's hash).
 */
export function useCanisterPage(): {
  canisterId: string
  payload: InterfacePayload
  iface: CanisterInterface | undefined
} {
  const { canisterId } = canisterRoute.useParams()
  const { payload } = canisterRoute.useLoaderData()
  const iface = useCanisterInterface(payload)
  return { canisterId, payload, iface }
}

// Bitcoin amounts on the ckBTC minter are satoshis.
const MINTER_UNITS: TokenUnits = { decimals: 8, symbol: "BTC" }

/**
 * How amounts read on a typed canister: the ledger's token, or bitcoin on
 * the minter. `undefined` for any other canister (its amounts stay raw).
 */
export function registryUnits(
  entry: RegistryEntry | undefined
): TokenUnits | undefined {
  if (entry === undefined) return undefined
  if (entry.kind === "ckbtc-minter") return MINTER_UNITS
  if (entry.decimals === undefined || entry.symbol === undefined) {
    return undefined
  }
  return { decimals: entry.decimals, symbol: entry.symbol }
}
