// Scenario 7: optimistic writes to the address book, composed with the
// client's mutation options.
//
// TanStack Query's optimistic recipe changes the cached list in `onMutate` and
// puts it back in `onError`. The client's options have an `onMutate` and an
// `onSettled` of their own: its `onMutate` resolves the canister this run
// writes to and the reads it invalidates, and its `onSettled` invalidates
// those reads (after a success, a `canister_err`, or a failure that may have
// executed). Replacing either would drop that, so both are kept:
//
// - our `onMutate` calls the client's first, with both arguments, and spreads
//   what it returns into ours: `{ ...options.onMutate(vars, context), ... }`;
// - our `onSettled` calls the client's with every argument it gets, and returns
//   its promise, so the mutation settles once the list is read again.
//
// On a refusal (`canister_err`) or a failure, `onError` restores the list as
// it was, then the client's re-read shows what the backend really holds.
//
// The cached list is found with `client.queryKey(backend, "contacts")`, built
// for the caller now. A key typed out by hand would leave the caller out, and
// match nothing the client caches or invalidates.
import type { ReactorError } from "@ic-reactor/core"
import { useClient } from "@ic-reactor/react"
import {
  useMutation,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query"
import type { Contact, Refusal } from "./canisters/backend.ts"
import { useCanisters } from "./use-canisters.ts"

/** The list as it was before an optimistic change, to put back on failure. */
interface Snapshot {
  readonly key: QueryKey
  readonly previous: Contact[]
}

/**
 * Shows `change(list)` in place of the cached list at once, and returns what
 * puts it back. Nothing is changed while the list has not been read.
 */
async function showOptimistically(
  queryClient: QueryClient,
  key: QueryKey,
  change: (list: readonly Contact[]) => Contact[]
): Promise<Snapshot | undefined> {
  // A read in flight would land after this, and overwrite the change.
  await queryClient.cancelQueries({ queryKey: key })
  const previous = queryClient.getQueryData<Contact[]>(key)
  if (previous === undefined) return undefined
  queryClient.setQueryData<Contact[]>(key, change(previous))
  return { key, previous }
}

function restore(queryClient: QueryClient, snapshot: Snapshot | undefined) {
  if (snapshot) queryClient.setQueryData(snapshot.key, snapshot.previous)
}

/** `add_contact`, shown in the list before the backend answers. */
export function useAddContact() {
  const client = useClient()
  const { backend } = useCanisters()
  // Only the contact list can change: the profile read is left alone.
  const options = client.mutationOptions(backend, "add_contact", {
    invalidates: [[backend, "contacts"]],
  })
  return useMutation({
    ...options,
    onMutate: async (contact, context) => {
      const targets = options.onMutate(contact, context)
      const snapshot = await showOptimistically(
        client.queryClient,
        client.queryKey(backend, "contacts"),
        (list) => [...list, contact]
      )
      return { ...targets, snapshot }
    },
    // Typed, because overriding the client's callbacks leaves TanStack
    // nothing else to infer the mutation's error type from.
    onError: (_error: ReactorError<Refusal>, _contact, result) =>
      restore(client.queryClient, result?.snapshot),
    onSettled: (data, error, contact, result, context) =>
      options.onSettled(data, error, contact, result, context),
  })
}

/** `remove_contact`, gone from the list before the backend answers. */
export function useRemoveContact() {
  const client = useClient()
  const { backend } = useCanisters()
  const options = client.mutationOptions(backend, "remove_contact", {
    invalidates: [[backend, "contacts"]],
  })
  return useMutation({
    ...options,
    onMutate: async (name, context) => {
      const targets = options.onMutate(name, context)
      const snapshot = await showOptimistically(
        client.queryClient,
        client.queryKey(backend, "contacts"),
        (list) => list.filter((contact) => contact.name !== name)
      )
      return { ...targets, snapshot }
    },
    onError: (_error: ReactorError<Refusal>, _name, result) =>
      restore(client.queryClient, result?.snapshot),
    onSettled: (data, error, name, result, context) =>
      options.onSettled(data, error, name, result, context),
  })
}
