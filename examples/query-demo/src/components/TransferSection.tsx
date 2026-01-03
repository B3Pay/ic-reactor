import { Suspense, useMemo, useState } from "react"
import { Principal } from "@icp-sdk/core/principal"
import { styles } from "../styles"
import { getIcpBalance, icpTransferMutation } from "../reactor"

export function TransferSection({ principal }: { principal: Principal }) {
  const [recipient, setRecipient] = useState("")
  const [amount, setAmount] = useState("10000") // 0.0001 ICP (8 decimals)
  const [validationError, setValidationError] = useState<string | null>(null)

  // 1. Get the user's account and balance query (for automatic refetching)
  const userAccount = useMemo(
    () => ({ owner: principal.toText(), subaccount: null }),
    [principal]
  )

  const userBalanceQuery = useMemo(
    () => getIcpBalance([userAccount]),
    [userAccount]
  )

  // 2. 🔥 Auto-refetch balance after successful transfer!
  const {
    mutate,
    isPending,
    error,
    isSuccess,
    data: txId,
  } = icpTransferMutation.useMutation({
    refetchQueries: [userBalanceQuery?.getQueryKey()],
  })

  // 3. Handle transfer
  const handleTransfer = () => {
    setValidationError(null)

    // Validate recipient
    try {
      Principal.fromText(recipient)
    } catch {
      setValidationError("Invalid recipient Principal")
      return
    }

    // Validate amount
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setValidationError("Invalid amount")
      return
    }

    // Execute transfer - DisplayReactor accepts string amounts!
    mutate([
      {
        to: { owner: recipient, subaccount: null },
        amount: amount,
        fee: null,
        memo: null,
        from_subaccount: null,
        created_at_time: null,
      },
    ])
  }

  return (
    <div style={styles.transferContainer}>
      {/* User Info & Balance */}
      <div style={styles.userInfo}>
        <span style={styles.userLabel}>Connected as:</span>
        <code style={styles.userPrincipal}>{principal?.toText()}</code>
      </div>

      {/* Balance Display */}
      <Suspense
        fallback={<div style={styles.balanceLoading}>Loading balance...</div>}
      >
        <UserBalance principal={principal?.toText() || ""} />
      </Suspense>

      {/* Transfer Form */}
      <div style={styles.transferForm}>
        <h3 style={styles.formTitle}>Send ICP</h3>

        <div style={styles.formGroup}>
          <label style={styles.formLabel}>Recipient Principal</label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="Enter recipient principal"
            style={styles.formInput}
            disabled={isPending}
          />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.formLabel}>
            Amount (e8s - 10000 = 0.0001 ICP)
          </label>
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount in e8s"
            style={styles.formInput}
            disabled={isPending}
          />
        </div>

        {validationError && (
          <p style={styles.errorMessage}>{validationError}</p>
        )}

        {error && (
          <p style={styles.errorMessage}>
            Transfer failed:{" "}
            {error instanceof Error ? error.message : String(error)}
          </p>
        )}

        {isSuccess && (
          <p style={styles.successMessage}>
            ✅ Transfer successful! Tx ID: {String(txId)}
          </p>
        )}

        <button
          onClick={handleTransfer}
          disabled={isPending || !recipient || !amount}
          style={{
            ...styles.transferButton,
            opacity: isPending || !recipient || !amount ? 0.5 : 1,
          }}
        >
          {isPending ? "Transferring..." : "Transfer ICP"}
        </button>
      </div>
    </div>
  )
}

function UserBalance({ principal }: { principal: string }) {
  if (!principal) return null

  const account = useMemo(
    () => ({ owner: principal, subaccount: null }),
    [principal]
  )
  const { data: balance } = getIcpBalance([account]).useSuspenseQuery()

  return (
    <div style={styles.userBalance}>
      <span style={styles.balanceLabel}>Your ICP Balance:</span>
      <span style={styles.balanceValue}>{balance}</span>
    </div>
  )
}
