"use client"

import React, { useState, useEffect, useMemo } from "react"
import { useLedgerReactor } from "./ledger-provider"
import { Principal } from "@icp-sdk/core/principal"
import { useICAuth } from "./providers"
import {
  createAuthHooks,
  formatTokenAmount,
  isPrincipalText,
  skipToken,
} from "@ic-reactor/react"
import type { Account } from "../declarations/ledger"

const POPULAR_TOKENS = [
  {
    name: "Internet Computer (ICP)",
    id: "ryjl3-tyaaa-aaaaa-aaaba-cai",
    symbol: "ICP",
    decimals: 8,
  },
  {
    name: "Chain-Key BTC (ckBTC)",
    id: "mxzaz-hqaaa-aaaar-qaada-cai",
    symbol: "ckBTC",
    decimals: 8,
  },
  {
    name: "Chain-Key ETH (ckETH)",
    id: "ss2fx-dyaaa-aaaar-qacoq-cai",
    symbol: "ckETH",
    decimals: 18,
  },
  {
    name: "Chain-Key USD Tether (ckUSDT)",
    id: "cngnf-vqaaa-aaaar-qag4q-cai",
    symbol: "ckUSDT",
    decimals: 6,
  },
  {
    name: "Chain-Key USD Coin (ckUSDC)",
    id: "xevnm-gaaaa-aaaar-qafnq-cai",
    symbol: "ckUSDC",
    decimals: 6,
  },
]

export default function TokenExplorer() {
  const { hooks, setCanisterId, currentCanisterId } = useLedgerReactor()
  const { useActorQuery } = hooks

  const { authentication } = useICAuth()
  const { useUserPrincipal } = createAuthHooks(authentication)
  const principal = useUserPrincipal()

  const [searchTarget, setSearchTarget] = useState("")
  const [activeAddress, setActiveAddress] = useState<string>("")

  // Sync user's personal principal as the default query target address
  useEffect(() => {
    if (principal) {
      setSearchTarget(principal.toString())
      setActiveAddress(principal.toString())
    }
  }, [principal])

  // Queries for token metadata directly from mainnet. The hooks belong to the
  // selected token's reactor, and its query keys start with its canister, so
  // each token is cached apart and a switch fetches the new token's values.
  const { data: name, isLoading: nameLoading } = useActorQuery({
    functionName: "icrc1_name",
  })
  const { data: symbol, isLoading: symbolLoading } = useActorQuery({
    functionName: "icrc1_symbol",
  })
  const { data: decimals, isLoading: decimalsLoading } = useActorQuery({
    functionName: "icrc1_decimals",
  })
  const { data: fee, isLoading: feeLoading } = useActorQuery({
    functionName: "icrc1_fee",
  })
  const { data: totalSupply, isLoading: supplyLoading } = useActorQuery({
    functionName: "icrc1_total_supply",
  })

  // The account whose balance to show, once the address parses
  const account = useMemo((): Account | undefined => {
    try {
      return activeAddress
        ? { owner: Principal.fromText(activeAddress), subaccount: [] }
        : undefined
    } catch {
      return undefined
    }
  }, [activeAddress])

  // Fetch live balance of the selected target principal. Until there is an
  // account, skipToken keeps the query waiting: no placeholder account, no
  // cast, no `enabled`, and the args are type-checked.
  const {
    data: balance,
    isLoading: balanceLoading,
    refetch: refetchBalance,
  } = useActorQuery({
    functionName: "icrc1_balance_of",
    args: account ? [account] : skipToken,
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const target = searchTarget.trim()
    if (!target) return
    if (isPrincipalText(target)) {
      setActiveAddress(target)
    } else {
      alert("Invalid Principal ID format. Please verify and try again.")
    }
  }

  // Four decimal places, cut rather than rounded, exact at any size and for
  // any decimals (ckETH has 18, ckUSDC 6).
  const formatAmount = (
    amount: bigint | undefined,
    decs: number | undefined
  ) =>
    amount === undefined || decs === undefined
      ? "0"
      : formatTokenAmount(amount, decs, {
          maxFractionDigits: 4,
          trimTrailingZeros: false,
        })

  return (
    <div className="bg-white p-6 rounded-lg shadow-md max-w-xl mx-auto mt-6">
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Select Live Mainnet Token:
        </label>
        <select
          value={currentCanisterId}
          onChange={(e) => setCanisterId(e.target.value)}
          className="w-full px-3 py-2 border rounded-md bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-800 font-medium"
        >
          {POPULAR_TOKENS.map((token) => (
            <option key={token.id} value={token.id}>
              {token.name} — {token.id.slice(0, 5)}...{token.id.slice(-5)}
            </option>
          ))}
        </select>
      </div>

      <div className="p-4 bg-indigo-50/50 rounded-lg border border-indigo-100 mb-6">
        <h4 className="font-bold text-sm text-indigo-900 uppercase tracking-wider mb-3">
          Live Token Details
        </h4>
        <div className="grid grid-cols-2 gap-4 text-sm text-gray-700">
          <div>
            <span className="text-gray-500 block text-xs">Token Name</span>
            <span className="font-semibold text-gray-900">
              {nameLoading ? "..." : String(name || "")}
            </span>
          </div>
          <div>
            <span className="text-gray-500 block text-xs">Ticker Symbol</span>
            <span className="font-semibold text-gray-900">
              {symbolLoading ? "..." : String(symbol || "")}
            </span>
          </div>
          <div>
            <span className="text-gray-500 block text-xs">Decimals</span>
            <span className="font-semibold text-gray-900">
              {decimalsLoading ? "..." : String(decimals || "")}
            </span>
          </div>
          <div>
            <span className="text-gray-500 block text-xs">Transfer Fee</span>
            <span className="font-semibold text-gray-900">
              {feeLoading || decimalsLoading
                ? "..."
                : formatAmount(fee, decimals)}{" "}
              {String(symbol || "")}
            </span>
          </div>
          <div className="col-span-2">
            <span className="text-gray-500 block text-xs">
              Total Circulation Supply
            </span>
            <span className="font-semibold text-gray-900 font-mono truncate block">
              {supplyLoading || decimalsLoading
                ? "..."
                : formatAmount(totalSupply, decimals)}{" "}
              {String(symbol || "")}
            </span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          type="text"
          value={searchTarget}
          onChange={(e) => setSearchTarget(e.target.value)}
          placeholder="Check Balance (Enter Principal ID)"
          className="flex-1 px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium text-sm transition-colors"
        >
          Query
        </button>
      </form>

      {activeAddress && (
        <div className="p-4 border border-gray-200 rounded-lg bg-gray-50/50">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-semibold text-gray-500">
              Query Account Balance:
            </span>
            <button
              onClick={() => refetchBalance()}
              className="text-xs text-indigo-600 hover:underline font-semibold"
            >
              Refresh
            </button>
          </div>
          <p className="text-xs text-gray-700 font-mono select-all truncate mb-2">
            {activeAddress}
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-indigo-950">
              {balanceLoading ? "..." : formatAmount(balance, decimals)}
            </span>
            <span className="text-sm font-bold text-gray-500">
              {String(symbol || "")}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
