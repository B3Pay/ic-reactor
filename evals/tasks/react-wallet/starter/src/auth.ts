// The sign-in state the wallet is given. Do not change this file.
import type { Identity } from "@icp-sdk/core/agent"

export interface WalletAuth {
  /** The current identity: the anonymous identity while signed out. */
  getIdentity(): Identity
  /** Whether someone is signed in now. */
  isAuthenticated(): boolean
  login(): Promise<void>
  logout(): Promise<void>
  /**
   * Called after every change of the above: sign-in, sign-out, and a switch
   * from one signed-in principal straight to another. Returns an unsubscribe.
   */
  subscribe(listener: () => void): () => void
}
