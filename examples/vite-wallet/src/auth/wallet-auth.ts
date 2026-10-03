// Scenarios 2 and 3: one client, two ways to sign in.
//
// A client has exactly one `auth`. To offer Internet Identity and the dev
// account side by side, this `AuthLike` holds both and answers for whichever
// one is signed in. Which one a sign-in uses travels in its options:
// `client.signIn(options)` (and `useAuth().signIn(options)`) hand `options`
// to the auth as they are, so
//
//   signIn({ with: "internet-identity" })
//   signIn({ with: "dev-account", account: 2 })
//
// pick the source. Signing in with one signs the other out, so a reload never
// finds two sessions. Whoever this auth reports is who every call is signed
// by, and the query keys carry their principal: a switch from one account to
// another (scenario 3) leaves the previous account's cached answers under
// keys the next account's reads never use.
import type { AuthLike } from "@ic-reactor/core"
import { AnonymousIdentity } from "@icp-sdk/core/agent"
import type { DevAccounts } from "./dev-accounts.ts"

/** What `signIn` takes: which source, and for the dev account, which account. */
export type SignInChoice =
  | { readonly with: "internet-identity" }
  | { readonly with: "dev-account"; readonly account?: number }

type Source = SignInChoice["with"]

/** The choice `options` makes; no options is Internet Identity. */
function readChoice(options: unknown): SignInChoice {
  if (options === undefined) return { with: "internet-identity" }
  const choice = options as { with?: unknown; account?: unknown }
  if (choice.with === "internet-identity") return { with: "internet-identity" }
  if (choice.with === "dev-account") {
    return typeof choice.account === "number"
      ? { with: "dev-account", account: choice.account }
      : { with: "dev-account" }
  }
  throw new TypeError(
    `Sign in with { with: "internet-identity" } or { with: "dev-account", account? }, got ${JSON.stringify(options)}.`
  )
}

/**
 * The auth of the wallet's client.
 *
 * @param sources.internetIdentity - Internet Identity's sign-in: an
 * `AuthClient` in the app. This auth owns it and disposes it.
 * @param sources.devAccounts - The tab's dev accounts, on a local page only.
 * They belong to the tab and are not disposed here.
 */
export function createWalletAuth(sources: {
  readonly internetIdentity: AuthLike
  readonly devAccounts?: DevAccounts
}): AuthLike {
  const { internetIdentity, devAccounts } = sources
  const anonymous = new AnonymousIdentity()

  const sourceOf = (which: Source): AuthLike | undefined =>
    which === "dev-account" ? devAccounts : internetIdentity
  const other = (which: Source): Source =>
    which === "dev-account" ? "internet-identity" : "dev-account"
  const holdsSession = (source: AuthLike | undefined): boolean =>
    source !== undefined && source.getStatus().state !== "signed-out"

  /** The source asked for last; on load, a dev account wins (it is this tab's). */
  let preferred: Source =
    devAccounts?.getStatus().state === "signed-in"
      ? "dev-account"
      : "internet-identity"

  /**
   * The source this auth answers for: the preferred one while it holds a
   * session (an expired one included, so the page can say it expired), else
   * the other one while that does, else none.
   */
  const active = (): AuthLike | undefined => {
    const first = sourceOf(preferred)
    if (holdsSession(first)) return first
    const second = sourceOf(other(preferred))
    return holdsSession(second) ? second : undefined
  }

  return {
    getPrincipal: () => active()?.getPrincipal(),
    getStatus: () => active()?.getStatus() ?? { state: "signed-out" },
    getIdentity: () => active()?.getIdentity() ?? Promise.resolve(anonymous),
    subscribe(listener) {
      const stops = [
        internetIdentity.subscribe(listener),
        devAccounts?.subscribe(listener),
      ]
      return () => {
        for (const stop of stops) stop?.()
      }
    },
    async signIn(options) {
      const choice = readChoice(options)
      if (choice.with === "dev-account") {
        if (devAccounts === undefined) {
          throw new Error("The dev account is offered on a local page only.")
        }
        // Preferred first, so that the dev account's own notification
        // already reports it, and the session it replaces never shows again.
        preferred = "dev-account"
        await devAccounts.signIn({ account: choice.account })
        if (holdsSession(internetIdentity)) {
          // The dev account answers already; ending the Internet Identity
          // session is housekeeping, and its failure (the revoke call did
          // not get through) must not undo a sign-in that happened.
          await internetIdentity.signOut().catch(() => undefined)
        }
        return
      }
      // Started before anything else is awaited: the Internet Identity
      // window opens from the click that asked for it. Until it resolves the
      // dev account, if one is signed in, keeps answering.
      await internetIdentity.signIn()
      preferred = "internet-identity"
      if (devAccounts?.getStatus().state === "signed-in") {
        await devAccounts.signOut()
      }
    },
    async signOut(options) {
      // AuthClient's `{ returnTo }` passes through; the dev account takes none.
      await active()?.signOut(options)
    },
    dispose() {
      internetIdentity.dispose?.()
    },
  }
}
