// `./Balance` of the Testing guide: the component its tests render. It shows
// `Balance: {data}` from the `balance` query and a Deposit button that runs the
// `deposit` mutation, which invalidates the balance.
import { useActorMutation, useActorQuery } from "./reactor/hooks"

export function Balance() {
  const { data } = useActorQuery({ functionName: "balance" })
  const { mutate } = useActorMutation({
    functionName: "deposit",
    invalidateQueries: [{ functionName: "balance" }],
  })

  return (
    <div>
      <p>Balance: {data}</p>
      <button onClick={() => mutate(["10"])}>Deposit</button>
    </div>
  )
}
