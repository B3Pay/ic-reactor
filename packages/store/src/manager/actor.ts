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
    canisterId: undefined,
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
    if (idlFactory === undefined) {
      throw new Error("idlFactory is required")
    }
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
    canisterId = canisterId || this.actorStore.getState().canisterId

    if (!canisterId) {
      throw new Error("canisterId is required")
    }

    this.updateActorState({
      initializing: true,
      initialized: false,
      methodState: {} as any,
    })

    try {
      const actor = Actor.createActor<A>(this.idlFactory, {
        agent,
        canisterId,
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
    const actor = this.actorStore.getState().actor

    if (!actor) {
      throw new Error("Actor not initialized")
    }

    if (!actor[functionName] || typeof actor[functionName] !== "function") {
      throw new Error(`Method ${String(functionName)} not found`)
    }

    const method = actor[functionName] as (
      ...args: ExtractReActorMethodArgs<A[typeof functionName]>
    ) => Promise<ExtractReActorMethodReturnType<A[typeof functionName]>>

    return await method(...args)
  }

  public getActorState = (): ReActorActorState<A> => {
    return this.actorStore.getState()
  }
}
