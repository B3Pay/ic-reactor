import Login from "Login"
import Notes from "Notes"
import AddNote from "./AddNote"
import { backend } from "declarations/candid"
import { AgentProvider, createActorContext } from "@ic-reactor/react"

const publicKey = crypto.getRandomValues(new Uint8Array(48))

export const { ActorProvider, useQueryCall, useUpdateCall } =
  createActorContext<typeof backend>({
    canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
  })

const App = () => {
  return (
    <AgentProvider>
      <Login />
      {/*  idlFactory can be fetched from the network if you not provide it */}
      <ActorProvider>
        <Notes publicKey={publicKey} />
        <AddNote publicKey={publicKey} />
      </ActorProvider>
    </AgentProvider>
  )
}

export default App
