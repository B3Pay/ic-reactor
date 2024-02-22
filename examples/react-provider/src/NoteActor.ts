import { createActorContext } from "@ic-reactor/react"
import { backend } from "declarations/candid"

export type Backend = typeof backend

export const {
  ActorProvider: NoteActorProvider,
  useQueryCall: useNoteQueryCall,
  useUpdateCall: useNoteUpdateCall,
} = createActorContext<Backend>({
  canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
})
