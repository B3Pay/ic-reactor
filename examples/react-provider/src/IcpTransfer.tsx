import { Principal } from "@dfinity/principal"
import { useMethod } from "@ic-reactor/react"
import { useState } from "react"

export const ICPTransfer = () => {
  const [principal, setPrincipal] = useState("")
  const [amount, setAmount] = useState("")

  const { call, data, loading, error } = useMethod({
    functionName: "icrc1_transfer",
  })

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
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
      <h2>Transfer:</h2>
      <div>
        Loading: {loading.toString()}
        <br />
        Error: {error?.toString()}
        <br />
        response:{" "}
        {data
          ? JSON.stringify(data, (_, v) =>
              typeof v === "bigint" ? v.toString() : v
            )
          : null}
      </div>
      <form onSubmit={onSubmit}>
        <input
          type="text"
          value={principal}
          name="principal"
          onChange={(e) => setPrincipal(e.target.value)}
        />
        <input
          type="text"
          value={amount}
          name="amount"
          onChange={(e) => setAmount(e.target.value)}
        />
        <button>Transfer</button>
      </form>
    </div>
  )
}
