import { useQueryCall, useUserPrincipal } from "@ic-reactor/react"
import { ICPLedger } from "./declarations/icp-ledger"
import { Principal } from "@ic-reactor/react/dist/types"

interface ICRCBalanceProps {}

const ICRCBalance: React.FC<ICRCBalanceProps> = () => {
  const principal = useUserPrincipal() as Principal

  const { call, data, loading, error } = useQueryCall<
    ICPLedger,
    "icrc1_balance_of"
  >({
    functionName: "icrc1_balance_of",
    args: [{ owner: principal, subaccount: [] }],
  })

  return (
    <div>
      <h2>Balance:</h2>
      <div>
        Loading: {loading?.toString()}
        <br />
        Error: {error?.toString()}
        <br />
        balance:{" "}
        {data !== undefined
          ? JSON.stringify(data, (_, v) =>
              typeof v === "bigint" ? v.toString() : v
            )
          : null}
      </div>
      <button onClick={call}>Get Balance</button>
    </div>
  )
}

export default ICRCBalance
