import { createActorContext } from "@ic-reactor/react"
import { backend, idlFactory } from "declarations/candid"

export type Backend = typeof backend

export const {
  ActorProvider: NoteActorProvider,
  useQueryCall: useNoteQueryCall,
  useUpdateCall: useNoteUpdateCall,
} = createActorContext<Backend>({
  idlFactory,
})
