import { jsonToString } from "@ic-reactor/react/dist/utils"
import { useCKBTCMinterMethod, useCKBTCMinterState } from "./Minter"
import { useRef } from "react"
import { useCKBTCLedgerMethod } from "./CKBTC"
import { Principal } from "@dfinity/principal"

interface MinterRetrieveBTCProps {
  userPrincipal: Principal
}

const MinterRetrieveBTC: React.FC<MinterRetrieveBTCProps> = ({
  userPrincipal,
}) => {
  const { canisterId } = useCKBTCMinterState()

  const minterCanisterId = Principal.fromText(canisterId)

  const addressRef = useRef<HTMLInputElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  const {
    call: refetchBalance,
    data: balance,
    loading: balanceLoading,
  } = useCKBTCLedgerMethod({
    functionName: "icrc1_balance_of",
    args: [{ owner: userPrincipal, subaccount: [] }],
  })

  const {
    call: refetchAllowance,
    data: allowance,
    loading: allowanceLoading,
  } = useCKBTCLedgerMethod({
    functionName: "icrc2_allowance",
    args: [
      {
        account: { owner: userPrincipal, subaccount: [] },
        spender: { owner: minterCanisterId, subaccount: [] },
      },
    ],
  })

  const {
    call: retreiveBtc,
    data: retreiveBtcResult,
    error: retreiveBtcError,
    loading: retreiveBtcLoading,
  } = useCKBTCMinterMethod({
    functionName: "retrieve_btc_with_approval",
    onSuccess: () => {
      refetchBalance()
      refetchAllowance()
    },
  })

  const {
    call: approve,
    loading: approveLoading,
    data: approveResult,
  } = useCKBTCLedgerMethod({
    functionName: "icrc2_approve",
    onSuccess: () => {
      refetchAllowance()

      const amount = BigInt(amountRef.current?.value || "0")
      const address = addressRef.current?.value || ""
      retreiveBtc([
        {
          amount,
          address,
          from_subaccount: [],
        },
      ])
    },
  })

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()

    const amount = BigInt(amountRef.current?.value || "0")
    approve([
      {
        spender: { owner: minterCanisterId, subaccount: [] },
        amount,
        fee: [],
        memo: [],
        created_at_time: [],
        from_subaccount: [],
        expected_allowance: [],
        expires_at: [],
      },
    ])
  }

  return (
    <div>
      <div>
        <span>
          <strong>ckBTC Balance</strong>:{" "}
          <button onClick={refetchBalance} disabled={balanceLoading}>
            ↻
          </button>{" "}
          {balanceLoading ? "Loading..." : jsonToString(balance)}
        </span>
      </div>
      <div>
        <span>
          <strong>Allowance to Minter</strong>:{" "}
          <button onClick={refetchAllowance} disabled={allowanceLoading}>
            ↻
          </button>
          {allowanceLoading ? "Loading..." : jsonToString(allowance)}
        </span>
      </div>
      <form onSubmit={onSubmit}>
        <h2>Retrieve BTC</h2>
        <input ref={addressRef} type="text" placeholder="Address" required />
        <input ref={amountRef} type="text" placeholder="Amount" required />
        <button>Retrieve</button>
      </form>
      <div>
        <span>
          <strong>Retrieve Result</strong>:
          {approveLoading ? (
            <div>Approving...</div>
          ) : retreiveBtcLoading ? (
            <div>
              <div>Approve Result: {jsonToString(approveResult)}</div>
              Retreiving...
            </div>
          ) : retreiveBtcLoading || retreiveBtcResult || retreiveBtcError ? (
            <div>
              <div>Approve Result: {jsonToString(approveResult)}</div>
              {retreiveBtcError ? (
                <div>Error: {retreiveBtcError.message}</div>
              ) : retreiveBtcResult ? (
                <div>Retreive Result: {jsonToString(retreiveBtcResult)}</div>
              ) : null}
            </div>
          ) : null}
        </span>
      </div>
    </div>
  )
}

export default MinterRetrieveBTC
