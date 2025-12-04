import { Principal } from "@icp-sdk/core/principal"
import { useRef } from "react"
import { useCKBTCLedgerMethod } from "./CKBTC"
import { jsonToString } from "@ic-reactor/react/dist/utils"

interface CKBTCTransferProps {}

const CKBTCTransfer: React.FC<CKBTCTransferProps> = () => {
  const principalRef = useRef<HTMLInputElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  const { call, data, isLoading, error } = useCKBTCLedgerMethod({
    functionName: "icrc1_transfer",
  })

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const principal = principalRef.current?.value || ""
    const amount = amountRef.current?.value || ""

    call([
      {
        to: {
          owner: Principal.fromText(principal),
          subaccount: [],
        },
        amount: BigInt(amount),
        fee: [],
        memo: [],
        created_at_time: [],
        from_subaccount: [],
      },
    ])
  }

  return (
    <div>
      <form onSubmit={onSubmit}>
        <h2>Transfer ckBTC:</h2>
        <input
          type="text"
          name="principal"
          ref={principalRef}
          placeholder="Principal"
          required
        />
        <input
          type="text"
          name="amount"
          ref={amountRef}
          placeholder="Amount"
          required
        />
        <button>Transfer</button>
      </form>
      <span>
        <strong>Transfer Result</strong>:
        {isLoading ? (
          <div>isLoading...</div>
        ) : error ? (
          <div>Error: {error.message}</div>
        ) : data ? (
          <div>{jsonToString(data)}</div>
        ) : null}
      </span>
    </div>
  )
}

export default CKBTCTransfer
