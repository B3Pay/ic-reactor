import Login from "Login"
import Notes from "Notes"
import AddNote from "./AddNote"
import { AgentProvider, createReActorContext } from "@ic-reactor/react"
import { backend } from "candid"

const publicKey = crypto.getRandomValues(new Uint8Array(48))

export const { ActorProvider, useQueryCall, useUpdateCall, useServiceFields } =
  createReActorContext<typeof backend>({
    canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
    withServiceFields: true,
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
