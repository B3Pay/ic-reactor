// Names the React README's snippets share: its reactor and hooks, and what
// its server-rendering and identity-attribute sections set up.
import type { ReactNode } from "react"
import {
  AuthenticationManager,
  createMutation,
  createReactorProvider,
  createSuspenseQueryFactory,
  defineReactor,
  type UseIdentityAttributesReturn,
} from "@ic-reactor/react"
import { backend, clientManager } from "./reactor"
import {
  canisterId,
  idlFactory,
  type Profile as ProfileData,
  type _SERVICE,
} from "./declarations/backend"

export * from "../app/globals"
export { canisterId, idlFactory, type _SERVICE } from "./declarations/backend"
export {
  backend,
  clientManager,
  queryClient,
  useActorMethod,
  useActorMutation,
  useActorQuery,
} from "./reactor"

export const authentication = new AuthenticationManager({ clientManager })

/** From `useIdentityAttributes()`, in the component the fragment is from. */
export declare const requestOpenIdAttributes: UseIdentityAttributesReturn["requestOpenIdAttributes"]

/** The page's component that renders a profile. */
export declare function Profile(props: { data: ProfileData }): ReactNode

/** A hand-written provider's factory. */
export const createReactorContext = () =>
  defineReactor<_SERVICE>({ name: "backend", idlFactory, canisterId })

export const { ReactorProvider, useReactor } =
  createReactorProvider(createReactorContext)

// The query factory and mutation of its "Factory Example".
export const getProfile = createSuspenseQueryFactory(backend, {
  functionName: "get_profile",
})

export const updateProfile = createMutation(backend, {
  functionName: "update_profile",
  invalidateQueries: [getProfile],
  onCanisterError: (err) => console.error("Canister Err variant:", err.code),
})
