import { jsonToString } from "@ic-reactor/core/dist/utils"
import { useICPQueryCall, useICPUpdateCall } from "./ICPProvider"
import { Principal } from "@dfinity/principal"
import { useRef } from "react"
import { useICDVState, useICDVUpdateCall } from "./ICDVProvider"

interface DonationProps {
  principal: Principal
}

const Donation: React.FC<DonationProps> = ({ principal }) => {
  const { canisterId } = useICDVState()

  const icdvCanisterId = Principal.fromText(canisterId.toString())

  const amountRef = useRef<HTMLInputElement>(null)

  const {
    call: refetchBalance,
    data: balance,
    loading: balanceLoading,
  } = useICPQueryCall({
    functionName: "icrc1_balance_of",
    args: [{ owner: principal, subaccount: [] }],
  })

  const {
    call: refetchAllowance,
    data: allowance,
    loading: allowanceLoading,
  } = useICPQueryCall({
    functionName: "icrc2_allowance",
    args: [
      {
        account: { owner: principal, subaccount: [] },
        spender: {
          owner: icdvCanisterId,
          subaccount: [],
        },
      },
    ],
  })

  const {
    call: mintFromICP,
    loading: mintFromICPLoading,
    data: mintFromICPResult,
    error: mintFromICPError,
  } = useICDVUpdateCall({
    functionName: "mintFromICP",
    onSuccess: () => {
      refetchBalance()
    },
  })

  const {
    call: approve,
    loading: approveLoading,
    data: approveResult,
  } = useICPUpdateCall({
    functionName: "icrc2_approve",
    onSuccess: () => {
      refetchAllowance()
      mintFromICP([
        {
          amount: BigInt(amountRef.current?.value || "0"),
          source_subaccount: [],
          target: [],
        },
      ])
    },
  })

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    approve([
      {
        spender: {
          owner: icdvCanisterId,
          subaccount: [],
        },
        amount: BigInt(amountRef.current?.value || "0"),
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
      <h2>ICP Wallet</h2>
      <span>Principal: {principal?.toString()}</span>
      <div>
        <span>
          <strong>Balance</strong>:{" "}
          <button onClick={refetchBalance} disabled={balanceLoading}>
            ↻
          </button>{" "}
          {balanceLoading ? "Loading..." : jsonToString(balance)}
        </span>
      </div>
      <div>
        <span>
          <strong>Allowance</strong>:{" "}
          <button onClick={refetchAllowance} disabled={allowanceLoading}>
            ↻
          </button>
          {allowanceLoading ? "Loading..." : jsonToString(allowance)}
        </span>
      </div>
      <form onSubmit={onSubmit}>
        <h2>Donate</h2>
        <input ref={amountRef} type="text" placeholder="Amount" />
        <button>Donate</button>
      </form>
      <div>
        <span>
          <strong>Donate Result</strong>:
          {approveLoading ? (
            <div>Approving...</div>
          ) : mintFromICPLoading ? (
            <div>
              <div>Approve Result: {jsonToString(approveResult)}</div>
              Minting...
            </div>
          ) : mintFromICPLoading || mintFromICPResult || mintFromICPError ? (
            <div>
              <div>Approve Result: {jsonToString(approveResult)}</div>
              {mintFromICPResult ? (
                <div>
                  Thanks for your donation! : {jsonToString(mintFromICPResult)}
                </div>
              ) : mintFromICPError ? (
                <div>Error: {mintFromICPError.message}</div>
              ) : null}
            </div>
          ) : null}
        </span>
      </div>
    </div>
  )
}

export default Donation
