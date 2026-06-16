"use client"

import React, { useState, useEffect } from "react"
import { useLedgerReactor } from "./ledger-provider"
import { Principal } from "@icp-sdk/core/principal"
import { useICAuth } from "./providers"
import { createAuthHooks } from "@ic-reactor/react"

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

  // Queries for token metadata directly from mainnet
  // Pass queryKey so that the cache is partitioned by currentCanisterId and react-query knows to refetch when the selected token changes!
  const { data: name, isLoading: nameLoading } = useActorQuery({
    functionName: "icrc1_name",
    queryKey: [currentCanisterId],
  })
  const { data: symbol, isLoading: symbolLoading } = useActorQuery({
    functionName: "icrc1_symbol",
    queryKey: [currentCanisterId],
  })
  const { data: decimals, isLoading: decimalsLoading } = useActorQuery({
    functionName: "icrc1_decimals",
    queryKey: [currentCanisterId],
  })
  const { data: fee, isLoading: feeLoading } = useActorQuery({
    functionName: "icrc1_fee",
    queryKey: [currentCanisterId],
  })
  const { data: totalSupply, isLoading: supplyLoading } = useActorQuery({
    functionName: "icrc1_total_supply",
    queryKey: [currentCanisterId],
  })

  // Safely parse principal for the balance query
  let parsedAccount: any = null
  try {
    if (activeAddress) {
      parsedAccount = {
        owner: Principal.fromText(activeAddress),
        subaccount: [],
      }
    }
  } catch (e) {}

  const defaultAccount = { owner: Principal.anonymous(), subaccount: [] as [] }

  // Fetch live balance of the selected target principal
  const {
    data: balance,
    isLoading: balanceLoading,
    refetch: refetchBalance,
  } = useActorQuery({
    functionName: "icrc1_balance_of",
    args: [parsedAccount || defaultAccount] as any,
    enabled: !!parsedAccount,
    queryKey: [currentCanisterId, activeAddress],
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchTarget.trim()) return
    try {
      Principal.fromText(searchTarget.trim())
      setActiveAddress(searchTarget.trim())
    } catch (e) {
      alert("Invalid Principal ID format. Please verify and try again.")
    }
  }

  const formatAmount = (val: any, decs: any) => {
    if (val === undefined || val === null) return "0"
    const bigVal = BigInt(val)
    const factor = BigInt(10) ** BigInt(decs || 8)
    const integerPart = bigVal / factor
    const fractionalPart = bigVal % factor
    const fractionStr = fractionalPart
      .toString()
      .padStart(Number(decs || 8), "0")
    return `${integerPart}.${fractionStr.slice(0, 4)}`
  }

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
