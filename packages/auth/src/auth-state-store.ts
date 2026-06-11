import type { AuthState } from "./types"

import { isDev } from "@ic-reactor/core"

/**
 * Holds authentication state and notifies subscribers on change.
 *
 * Each update increments a monotonic revision so callers can detect whether
 * the state they are about to act on is still current (used to ignore the
 * result of stale async session-restore work).
 *
 * @example
 * ```ts
 * const store = new AuthStateStore()
 * const unsubscribe = store.subscribe((state) => console.log(state))
 * store.update({ isAuthenticating: true })
 * ```
 */
export class AuthStateStore {
  private revision = 0
  private subscribers: Array<(state: AuthState) => void> = []

  public state: AuthState = {
    identity: null,
    isAuthenticating: false,
    isAuthenticated: false,
    error: undefined,
  }

  /** The current revision. Increments on every {@link update}. */
  public get currentRevision(): number {
    return this.revision
  }

  /**
   * Subscribe to state changes.
   * @returns An unsubscribe function.
   */
  public subscribe(callback: (state: AuthState) => void): () => void {
    this.subscribers.push(callback)
    return () => {
      this.subscribers = this.subscribers.filter(
        (subscriber) => subscriber !== callback
      )
    }
  }

  /** Merge a partial state, bump the revision, and notify subscribers. */
  public update(newState: Partial<AuthState>): void {
    if (isDev()) console.debug("[ic-reactor] Updating Auth State:", newState)
    this.revision += 1
    this.state = { ...this.state, ...newState }
    this.subscribers.forEach((subscriber) => subscriber(this.state))
  }
}
