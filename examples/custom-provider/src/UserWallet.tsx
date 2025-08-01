import { jsonToString } from "@ic-reactor/core/dist/utils"
import { useICRC1QueryCall, useICRC1UpdateCall } from "./ICRC1Provider"
import { Principal } from "@dfinity/principal"
import { useRef } from "react"

interface UserWalletProps {
  principal: Principal
}

const UserWallet: React.FC<UserWalletProps> = ({ principal }) => {
  const toRef = useRef<HTMLInputElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  const {
    call: refetchBalance,
    data: balance,
    isLoading: isBalanceLoading,
  } = useICRC1QueryCall({
    functionName: "icrc1_balance_of",
    args: [{ owner: principal, subaccount: [] }],
  })

  const {
    call: transfer,
    isLoading: isTransferLoading,
    error: callError,
    compileResult,
  } = useICRC1UpdateCall({
    functionName: "icrc1_transfer",
  })

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    transfer([
      {
        to: {
          owner: Principal.fromText(toRef.current?.value || ""),
          subaccount: [],
        },
        amount: BigInt(amountRef.current?.value || "0"),
        fee: [],
        memo: [],
        created_at_time: [],
        from_subaccount: [],
      },
    ])
  }

  const { isOk, value, error } = compileResult()

  return (
    <div>
      <h2>User Wallet</h2>
      <span>Principal: {principal?.toString()}</span>
      <div>
        <span>
          <strong>Balance</strong>:{" "}
          <button onClick={refetchBalance} disabled={isBalanceLoading}>
            ↻
          </button>{" "}
          {isBalanceLoading ? "Loading..." : jsonToString(balance)}
        </span>
      </div>
      <form onSubmit={onSubmit}>
        <input ref={toRef} type="text" placeholder="To" />
        <input ref={amountRef} type="text" placeholder="Amount" />
        <button>Transfer</button>
      </form>
      <div>
        <span>
          <strong>Transfer Result</strong>: {isTransferLoading && "Loading..."}
          {callError && `Error: ${callError.message}`}
          {isOk && jsonToString(value)}
          {error && `Error: ${jsonToString(error)}`}
        </span>
      </div>
    </div>
  )
}

export default UserWallet
