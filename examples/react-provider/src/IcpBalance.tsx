import { useQueryCall, useUserPrincipal } from "@ic-reactor/react"

export const ICPLedger = () => {
  const principal = useUserPrincipal()

  const { call, data, loading, error } = useQueryCall({
    functionName: "icrc1_balance_of",
    args: [{ owner: principal, subaccount: [] }],
  })

  return (
    <div>
      <h2>ICP Balance:</h2>
      <div>
        Loading: {loading.toString()}
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
