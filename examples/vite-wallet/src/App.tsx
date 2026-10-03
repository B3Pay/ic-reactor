// The wallet: one client per tab, and one section per scenario.
import { ReactorProvider } from "@ic-reactor/react"
import { AddressBook } from "./AddressBook.tsx"
import type { DevAccounts } from "./auth/dev-accounts.ts"
import { Balance } from "./Balance.tsx"
import { createWalletClient } from "./client.ts"
import { EnvironmentPanel } from "./EnvironmentPanel.tsx"
import { Profile } from "./Profile.tsx"
import { SendIcp } from "./SendIcp.tsx"
import { SignIn } from "./SignIn.tsx"

export function App({ devAccounts }: { devAccounts?: DevAccounts }) {
  return (
    // The factory creates the client, so the provider owns it: built once
    // per mounted tree (React may call the factory twice in development and
    // keep one), disposed with its auth and cache when the tree unmounts.
    <ReactorProvider client={() => createWalletClient(devAccounts)}>
      <Wallet devAccounts={devAccounts} />
    </ReactorProvider>
  )
}

/** The page, on whichever client the provider above it holds. */
export function Wallet({ devAccounts }: { devAccounts?: DevAccounts }) {
  return (
    <main>
      <h1>ICP wallet on ic-reactor 4</h1>
      <p className="lede">
        A React and Vite app on a local icp-cli network: an ICP ledger, a
        backend canister of its own, Internet Identity, and TanStack
        Query&apos;s own hooks with the options the client builds.
      </p>
      <EnvironmentPanel />
      <SignIn devAccounts={devAccounts} />
      <Balance />
      <SendIcp />
      <Profile />
      <AddressBook />
    </main>
  )
}
