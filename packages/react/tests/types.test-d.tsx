/**
 * Type-level tests, compiled by `pnpm typecheck` and never run. A line that
 * carries a `@ts-expect-error` guards a mistake the types must keep refusing:
 * if the types widen, the directive goes unused and the build fails.
 */
import type { AuthState, Client } from "@ic-reactor/core"
import {
  ReactorProvider,
  useAuth,
  useClient,
  type ReactorProviderProps,
} from "../src/index.js"

declare const client: Client

// The provider takes a factory, so that it decides when the client is built.
// A client made at module scope is shared by every request on a server.
export const factory = (
  <ReactorProvider client={() => client}>x</ReactorProvider>
)
export const noFactory = (
  // @ts-expect-error a client is not a factory
  <ReactorProvider client={client}>x</ReactorProvider>
)
export const noChildren = (
  // @ts-expect-error a provider with nothing under it is a mistake
  <ReactorProvider client={() => client} />
)
export const props: ReactorProviderProps = {
  client: () => client,
  children: null,
}

export function Probe() {
  const read: Client = useClient()

  const auth = useAuth()
  const state: AuthState = auth
  const status: "anonymous" | "signed-in" | "expired" | "signed-in-elsewhere" =
    auth.status
  const principal: string = auth.principal
  const signedIn: Promise<void> = auth.signIn()
  const withOptions: Promise<void> = auth.signIn({ maxTimeToLive: 1n })
  const signedOut: Promise<void> = auth.signOut()

  // @ts-expect-error the state is read, not written
  auth.status = "signed-in"
  // @ts-expect-error there is no status the client does not report
  const unknown: typeof auth.status = "pending"
  // sign-out passes its options on, such as AuthClient's { returnTo }
  void auth.signOut({ returnTo: "https://app.example/bye" })

  return [
    read,
    state,
    status,
    principal,
    signedIn,
    withOptions,
    signedOut,
    unknown,
  ].length
}
