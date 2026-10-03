// The wallet: one client per tab, and one section per scenario.
import { ReactorProvider, useAuth } from "@ic-reactor/react"
import { Fragment } from "react"
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
  const { principal } = useAuth()
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
      {/*
        The account's own sections, mounted again whenever the caller
        changes. Their reads are keyed by the caller already, but what they
        keep in component state is not: a form, the last transfer's outcome
        (an InsufficientFunds error carries that account's balance), a
        mutation's error. Keyed by the principal, none of it is shown to the
        next account, or to nobody after a sign-out.
      */}
      <Fragment key={principal}>
        <Balance />
        <SendIcp />
        <Profile />
        <AddressBook />
      </Fragment>
    </main>
  )
}
