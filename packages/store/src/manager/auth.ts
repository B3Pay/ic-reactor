import { AuthClient } from "@dfinity/auth-client"
import { createStoreWithOptionalDevtools } from "../helper"
import type {
  ActorSubclass,
  ReActorAuthState,
  ReActorAuthStore,
} from "../types"

export class ReActorAuth<A extends ActorSubclass<any>> {
  private authStore: ReActorAuthStore<A>

  private DEFAULT_AUTH_STATE: ReActorAuthState<A> = {
    identity: null,
    authClient: null,
    authenticating: false,
    authenticated: false,
    error: undefined,
  }

  constructor(withDevtools = false) {
    this.authStore = createStoreWithOptionalDevtools(this.DEFAULT_AUTH_STATE, {
      withDevtools,
      store: "auth",
    })
  }

  private updateAuthState = (newState: Partial<ReActorAuthState<A>>) => {
    this.authStore.setState((state) => ({ ...state, ...newState }))
  }

  public authenticate = async () => {
    this.updateAuthState({ authenticating: true })

    try {
      const authClient = await AuthClient.create()
      const authenticated = await authClient.isAuthenticated()
      const identity = authClient.getIdentity()

      if (!identity) {
        throw new Error("Identity not found")
      }

      this.updateAuthState({
        authClient,
        authenticated,
        identity,
        authenticating: false,
      })
    } catch (error) {
      this.updateAuthState({ error: error as Error, authenticating: false })
      console.error("Error in authenticate:", error)
    }
  }

  public getAuthState = (): ReActorAuthState<A> => {
    return this.authStore.getState()
  }
}
