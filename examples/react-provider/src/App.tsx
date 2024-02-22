import Login from "Login"
import Notes from "Notes"
import AddNote from "./AddNote"
import { backend } from "declarations/candid"
import { AgentProvider, ActorProvider, useQueryCall } from "@ic-reactor/react"

const publicKey = crypto.getRandomValues(new Uint8Array(48))

export type Backend = typeof backend

const App = () => {
  return (
    <AgentProvider>
      <Login />
      {/*  idlFactory can be fetched from the network if you not provide it */}
      <ActorProvider canisterId="ryjl3-tyaaa-aaaaa-aaaba-cai">
        <ICPLedger />
      </ActorProvider>
      <ActorProvider canisterId="xeka7-ryaaa-aaaal-qb57a-cai">
        <Notes publicKey={publicKey} />
        <AddNote publicKey={publicKey} />
      </ActorProvider>
    </AgentProvider>
  )
}

export default App

const ICPLedger = () => {
  const { call, data, loading, error } = useQueryCall({
    functionName: "name",
  })

  return (
    <div>
      <h2>Test:</h2>
      <div>
        Loading: {loading.toString()}
        <br />
        Error: {error?.toString()}
        <br />
        Data:{" "}
        {data
          ? JSON.stringify(data, (_, v) =>
              typeof v === "bigint" ? v.toString() : v
            )
          : null}
      </div>
      <button onClick={call}>Get Name</button>
    </div>
  )
}
