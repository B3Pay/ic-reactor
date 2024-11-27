import Login from "Login"
import Notes from "Notes"
import AddNote from "./AddNote"
import {
  AgentProvider,
  ActorProvider,
  CandidAdapterProvider,
} from "@ic-reactor/react"
import { NoteActorProvider } from "NoteActor"
import Ledger from "Ledger"

const publicKey = crypto.getRandomValues(new Uint8Array(48))

const App = () => {
  return (
    <AgentProvider withDevtools>
      <Login />
      {/*  idlFactory can be fetched from the network using CandidAdapterProvider */}
      <CandidAdapterProvider>
        <ActorProvider
          canisterId="mxzaz-hqaaa-aaaar-qaada-cai"
          name="CKBTC Ledger"
          loadingComponent={<div>Loading CKBTC Ledger...</div>}
        >
          <Ledger />
        </ActorProvider>
        <ActorProvider
          withDevtools
          canisterId="ryjl3-tyaaa-aaaaa-aaaba-cai"
          name="ICP Ledger"
          loadingComponent={<div>Loading Icp Ledger...</div>}
        >
          <Ledger />
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
