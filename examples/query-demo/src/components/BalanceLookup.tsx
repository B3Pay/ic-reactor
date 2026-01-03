import { Suspense, useMemo, useState } from "react"
import { Principal } from "@icp-sdk/core/principal"
import { styles } from "../styles"
import { BalanceCard } from "./Cards"
import { getIcpBalance, getCkBtcBalance, getCkEthBalance } from "../reactor"

// Display account type (used with DisplayReactor)
interface DisplayAccount {
  owner: string
  subaccount?: null | Uint8Array
}

export function BalanceLookup() {
  const [principalInput, setPrincipalInput] = useState(
    "ryjl3-tyaaa-aaaaa-aaaba-cai" // ICP Ledger as example
  )
  const [account, setAccount] = useState<DisplayAccount | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleLookup = () => {
    try {
      // Validate the principal format
      Principal.fromText(principalInput)
      // With  owner should be a string (the principal text)
      setAccount({ owner: principalInput, subaccount: null })
      setError(null)
    } catch {
      setError("Invalid Principal ID")
      setAccount(null)
    }
  }

  return (
    <div style={styles.lookupContainer}>
      <div style={styles.inputGroup}>
        <input
          type="text"
          value={principalInput}
          onChange={(e) => setPrincipalInput(e.target.value)}
          placeholder="Enter Principal ID"
          style={styles.input}
        />
        <button onClick={handleLookup} style={styles.button}>
          Lookup Balance
        </button>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {account && (
        <Suspense fallback={<BalanceLoadingState />}>
          <BalanceResults account={account} />
        </Suspense>
      )}
    </div>
  )
}

function BalanceResults({ account }: { account: DisplayAccount }) {
  // Memoize the query objects to ensure stability
  const { icpBalance, ckBtcBalance, ckEthBalance } = useMemo(
    () => ({
      icpBalance: getIcpBalance([account]),
      ckBtcBalance: getCkBtcBalance([account]),
      ckEthBalance: getCkEthBalance([account]),
    }),
    [account]
  )

  // Use the queries - data is guaranteed to be defined (useSuspenseQuery)
  const { data: icp } = icpBalance.useSuspenseQuery()
  const { data: ckBTC } = ckBtcBalance.useSuspenseQuery()
  const { data: ckETH } = ckEthBalance.useSuspenseQuery()

  return (
    <div style={styles.balanceGrid}>
      <BalanceCard token="ICP" balance={icp} color="#60a5fa" />
      <BalanceCard token="ckBTC" balance={ckBTC} color="#f59e0b" />
      <BalanceCard token="ckETH" balance={ckETH} color="#8b5cf6" />
    </div>
  )
}

function BalanceLoadingState() {
  return (
    <div style={styles.balanceGrid}>
      <BalanceCard token="ICP" balance="..." color="#60a5fa" loading />
      <BalanceCard token="ckBTC" balance="..." color="#f59e0b" loading />
      <BalanceCard token="ckETH" balance="..." color="#8b5cf6" loading />
    </div>
  )
}
