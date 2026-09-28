// `./ICRC1Provider` of the custom-provider demo: the `src/ICRC1Provider.tsx`
// its first example shows.
import {
  Reactor,
  createActorHooks,
  createReactorProvider,
} from "@ic-reactor/react"
import { idlFactory, type ICRC1 } from "./declarations/icrc1"
import { clientManager } from "./reactor"

const { ReactorProvider, useReactor } = createReactorProvider(
  ({ canisterId }: { canisterId: string }) => {
    const reactor = new Reactor<ICRC1>({
      name: "icrc1",
      clientManager,
      canisterId,
      idlFactory,
    })
    return { canisterId, hooks: createActorHooks(reactor) }
  }
)

export const useICRC1Context = useReactor

export default ReactorProvider
