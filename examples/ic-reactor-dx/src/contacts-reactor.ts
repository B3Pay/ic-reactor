import {
  ClientManager,
  Reactor,
  createActorHooks,
  createMutation,
  createQueryFactory,
} from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"
import { type ActorMethod } from "@icp-sdk/core/agent"
import {
  type Contact,
  type ContactId,
  contacts as contactsServiceSchema,
} from "../contact.generated.js"

type ContactsActor = {
  lookup_contact: ActorMethod<[ContactId], [] | [Contact]>
  save_contact: ActorMethod<[Contact], ContactId>
}

export const queryClient = new QueryClient()

export const clientManager = new ClientManager({
  queryClient,
  withLocalEnv: true,
})

export const contactsReactor = new Reactor<ContactsActor>({
  clientManager,
  name: "contacts",
  serviceSchema: contactsServiceSchema,
})

export const contactsCanisterId = contactsReactor.canisterId.toString()

export const ready = clientManager.initializeAgent()

export const { useActorQuery, useActorMutation, useActorMethod } =
  createActorHooks(contactsReactor)

export const lookupContact = createQueryFactory(contactsReactor, {
  functionName: "lookup_contact",
})

export const saveContact = createMutation(contactsReactor, {
  functionName: "save_contact",
})

export type { Contact, ContactId }
