import Login from "Login"
import Notes from "Notes"
import AddNote from "./AddNote"
import { AgentProvider, ActorProvider } from "@ic-reactor/react"
import { NoteActorProvider } from "NoteActor"
import { ICPBalance } from "IcpBalance"
import { ICPTransfer } from "IcpTransfer"

const publicKey = crypto.getRandomValues(new Uint8Array(48))

const App = () => {
  return (
    <AgentProvider>
      <Login />
      {/*  idlFactory can be fetched from the network if you not provide it */}
      <ActorProvider
        canisterId="ryjl3-tyaaa-aaaaa-aaaba-cai"
        loadingComponent={<div>Loading Icp Ledger...</div>}
      >
        <ICPBalance />
        <ICPTransfer />
      </ActorProvider>
      <NoteActorProvider loadingComponent={<div>Loading Note Actor...</div>}>
        <Notes publicKey={publicKey} />
        <AddNote publicKey={publicKey} />
      </NoteActorProvider>
    </AgentProvider>
  )
}

export default App
