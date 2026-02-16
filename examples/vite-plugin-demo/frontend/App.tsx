import { useBackendQuery, useBackendMutation } from "./lib/canisters/backend"

function App() {
  const { data: greeting, isPending: greetingPending } = useBackendQuery({
    functionName: "greet",
    args: "Vite Plugin",
  })

  const { data: count, isPending: countPending } = useBackendQuery({
    functionName: "getCount",
  })

  const { mutate: increment, isPending: incrementing } = useBackendMutation({
    functionName: "increment",
  })

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Vite Plugin Demo</h1>

      <section>
        <h2>Greeting</h2>
        <p>{greetingPending ? "Loading..." : greeting}</p>
      </section>

      <section>
        <h2>Counter</h2>
        <p>Current Count: {countPending ? "..." : count?.toString()}</p>
        <button onClick={() => increment([])} disabled={incrementing}>
          {incrementing ? "Incrementing..." : "Increment"}
        </button>
      </section>
    </div>
  )
}

export default App
