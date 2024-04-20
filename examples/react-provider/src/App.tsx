import Login from "Login"
import Notes from "Notes"
import AddNote from "./AddNote"
import {
  AgentProvider,
  ActorProvider,
  CandidAdapterProvider,
} from "@ic-reactor/react"
import { NoteActorProvider } from "NoteActor"
import { ICPBalance } from "IcpBalance"
import { ICPTransfer } from "IcpTransfer"

const publicKey = crypto.getRandomValues(new Uint8Array(48))

const App = () => {
  console.log(process.env.DFX_NETWORK === "local")
  return (
    <AgentProvider withDevtools>
      <Login />
      {/*  idlFactory can be fetched from the network using CandidAdapterProvider */}
      <CandidAdapterProvider>
        <ActorProvider
          withDevtools
          canisterId="ryjl3-tyaaa-aaaaa-aaaba-cai"
          loadingComponent={<div>Loading Icp Ledger...</div>}
        >
          <ICPBalance />
          <ICPTransfer />
        </ActorProvider>
        <NoteActorProvider
          withDevtools
          canisterId="xeka7-ryaaa-aaaal-qb57a-cai"
          loadingComponent={<div>Loading Note Actor...</div>}
        >
          <Notes publicKey={publicKey} />
          <AddNote publicKey={publicKey} />
        </NoteActorProvider>
      </CandidAdapterProvider>
    </AgentProvider>
  )
}

export default App
