import {
  AgentProvider,
  ActorProvider,
  CandidAdapterProvider,
} from "@ic-reactor/react"

export default function IcReactorDemo() {
  return (
    <AgentProvider withDevtools>
      <CandidAdapterProvider>
        <ActorProvider
          canisterId="ryjl3-tyaaa-aaaaa-aaaba-cai"
          name="ICP Ledger"
          loadingComponent={<div>Loading ICP Ledger...</div>}
        >
          <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-green-100 to-blue-100 p-4 text-white">
            <div className="w-full max-w-2xl p-8 rounded-xl backdrop-blur-md bg-black/50 shadow-xl border-8 border-black/10">
              <h1 className="text-2xl mb-4">IC Reactor Basic Setup</h1>
              <p className="mb-4">
                This demo showcases the basic setup of IC Reactor with React.
                The ActorProvider fetches the ICP Ledger canister actor and
                makes it available to the component tree. You can now use React
                hooks from IC Reactor to interact with the canister.
              </p>
            </div>
          </div>
        </ActorProvider>
      </CandidAdapterProvider>
    </AgentProvider>
  )
}
