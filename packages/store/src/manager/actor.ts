import { Actor, ActorSubclass } from "@dfinity/agent"
import { createStoreWithOptionalDevtools, extractMethodField } from "../helper"
import type {
  CanisterId,
  ExtractReActorMethodArgs,
  ExtractReActorMethodReturnType,
  HttpAgent,
  ReActorActorState,
  ReActorActorStore,
  ReActorMethodStates,
} from "../types"
import { IDL } from "@dfinity/candid"

export type ReActorOptions = {
  withDevtools?: boolean
  canisterId?: CanisterId
  idlFactory: IDL.InterfaceFactory
}

export class ReActorActor<A extends ActorSubclass<any>> {
  public actorStore: ReActorActorStore<A>
  public canisterId: CanisterId | undefined

  private idlFactory: IDL.InterfaceFactory
  private DEFAULT_ACTOR_STATE: ReActorActorState<A> = {
    methodState: {} as ReActorMethodStates<A>,
    methodFields: [],
    initializing: false,
    initialized: false,
    error: undefined,
    actor: null,
  }

  constructor({
    withDevtools = false,
    idlFactory,
    canisterId,
  }: ReActorOptions) {
    this.idlFactory = idlFactory
    this.canisterId = canisterId

    const methodFields = extractMethodField(idlFactory)

    this.actorStore = createStoreWithOptionalDevtools(
      { ...this.DEFAULT_ACTOR_STATE, methodFields },
      { withDevtools, store: "actor" }
    )
  }

  private updateActorState = (newState: Partial<ReActorActorState<A>>) => {
    this.actorStore.setState((state) => ({ ...state, ...newState }))
  }

  public createActor = async (agent: HttpAgent, canisterId?: CanisterId) => {
    this.canisterId = canisterId || this.canisterId

    if (!this.canisterId) {
      throw new Error("CanisterId is required")
    }

    this.updateActorState({
      initializing: true,
      initialized: false,
      methodState: {} as any,
    })

    try {
      const actor = Actor.createActor<A>(this.idlFactory, {
        agent,
        canisterId: this.canisterId,
      })

      if (!actor) {
        throw new Error("Failed to initialize actor")
      }

      this.updateActorState({
        actor,
        initializing: false,
        initialized: true,
      })
    } catch (error) {
      this.updateActorState({ error: error as Error, initializing: false })
    }
  }

  public callMethod = async <M extends keyof A>(
    functionName: M,
    ...args: ExtractReActorMethodArgs<A[M]>
  ): Promise<ExtractReActorMethodReturnType<A[M]>> => {
    const { actor } = this.actorStore.getState()

    if (!actor) {
      throw new Error("Actor not initialized")
    }

    if (!actor[functionName] || typeof actor[functionName] !== "function") {
      throw new Error(`Method ${String(functionName)} not found`)
    }

    const method = actor[functionName] as (
      ...args: ExtractReActorMethodArgs<A[M]>
    ) => Promise<ExtractReActorMethodReturnType<A[M]>>

    return await method(...args)
  }

  public getActorState = (): ReActorActorState<A> => {
    return this.actorStore.getState()
  }
}
