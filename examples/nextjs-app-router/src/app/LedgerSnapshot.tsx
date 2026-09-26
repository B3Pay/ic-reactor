import React from "react"
import { connection } from "next/server"
import { QueryClient } from "@tanstack/react-query"
// A server component: this import resolves through @ic-reactor/react's
// `react-server` export condition, which carries the core runtime classes and
// none of the hooks.
import { ClientManager, Reactor, formatTokenAmount } from "@ic-reactor/react"
import { idlFactory, canisterId } from "../declarations/ledger"
import type { _SERVICE } from "../declarations/ledger"

/**
 * Reads the ICP ledger on the server, once per request.
 *
 * Everything is constructed inside the request: a reactor owns its
 * QueryClient, and query keys carry no caller, so a module-scope reactor on a
 * server would share one cache across every visitor.
 */
export default async function LedgerSnapshot() {
  // Render per request rather than at build time, so `next build` never calls
  // mainnet.
  await connection()

  const clientManager = new ClientManager({
    queryClient: new QueryClient(),
    agentOptions: { host: "https://ic0.app" },
  })
  const ledger = new Reactor<_SERVICE>({
    name: "ledger",
    clientManager,
    idlFactory,
    canisterId,
  })

  try {
    const [symbol, decimals, totalSupply] = await Promise.all([
      ledger.fetchQuery({ functionName: "icrc1_symbol" }),
      ledger.fetchQuery({ functionName: "icrc1_decimals" }),
      ledger.fetchQuery({ functionName: "icrc1_total_supply" }),
    ])

    return (
      <p className="max-w-xl mx-auto mb-8 text-center text-sm text-gray-500">
        Rendered on the server:{" "}
        {/* Whole tokens only: the fraction does not matter at total-supply
            scale. formatTokenAmount is React-free, so the react-server entry
            exports it too. */}
        {formatTokenAmount(totalSupply, decimals, {
          maxFractionDigits: 0,
          locale: "en-US",
        })}{" "}
        {symbol} in circulation.
      </p>
    )
  } catch (error) {
    return (
      <p className="max-w-xl mx-auto mb-8 text-center text-sm text-red-500">
        The server could not read the ledger:{" "}
        {error instanceof Error ? error.message : String(error)}
      </p>
    )
  }
}
