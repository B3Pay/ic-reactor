/**
 * A sign-in a test controls: the same surface an `@icp-sdk/auth` 10
 * `AuthClient` has, driven by calls instead of an identity provider.
 */
import { AnonymousIdentity, type Identity } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import type { Principal } from "@icp-sdk/core/principal"

/**
 * Who is signed in, as `AuthClient.getStatus()` reports it: the four states
 * of `@icp-sdk/auth` 10's `SessionStatus`.
 *
 * - `signed-in`: calls as `principal` are accepted.
 * - `expired`: `principal`'s session has ended.
 * - `signed-in-elsewhere`: `principal` is signed in on this domain, but this
 *   origin holds no credential for it, so it cannot act yet.
 * - `signed-out`: nobody is signed in.
 *
 * @inline
 */
export type TestAuthStatus =
  | { state: "signed-in"; principal: Principal; expiresAtMs: number }
  | { state: "expired"; principal: Principal; expiresAtMs: number }
  | { state: "signed-in-elsewhere"; principal: Principal; expiresAtMs: number }
  | { state: "signed-out" }

/**
 * Options for {@link createTestAuth}. Say who signs in with `identity` or with
 * `seed`, not both.
 */
export type TestAuthOptions = (
  | {
      /**
       * The identity the auth signs in as. Its principal is what a canister's
       * `ctx.caller` reports, and the fake replica checks it signs for itself,
       * so it must be a real signing identity such as `Ed25519KeyIdentity`.
       *
       * @defaultValue The identity of seed `1`.
       */
      identity?: Identity
      seed?: never
    }
  | {
      /**
       * A number that stands for an identity: the same seed is the same
       * principal in every run and on every machine.
       */
      seed?: number
      identity?: never
    }
) & {
  /**
   * Whether the auth starts signed in. When `false` it starts signed out and
   * remembers the identity for a later `signIn()`.
   *
   * @defaultValue true
   */
  signedIn?: boolean
}

/**
 * A sign-in made by {@link createTestAuth}.
 *
 * @inline
 */
export interface TestAuth {
  /**
   * The principal calls are accepted as, or `undefined` unless the status is
   * `signed-in`: an expired or elsewhere session names a principal in
   * `getStatus()` but cannot act. Synchronous, and derived from
   * the same state as `getStatus()`, so the two never disagree.
   */
  getPrincipal(): Principal | undefined
  /**
   * Who is signed in, as `AuthClient.getStatus()` reports it: its `state` is
   * `signed-in` (calls as `principal` are accepted), `expired` (the session of
   * `principal` has ended), `signed-in-elsewhere` (`principal` is signed in on
   * this domain, but this origin holds no credential for it, so it cannot act
   * yet) or `signed-out` (nobody is, and there is no `principal`).
   * Synchronous. The object it returns is the same one until the status
   * changes, so it is safe to read from `useSyncExternalStore`.
   */
  getStatus(): TestAuthStatus
  /**
   * The identity to sign calls with: the signed-in one, or
   * `AnonymousIdentity` in every other state, as `AuthClient` answers while
   * nobody is signed in.
   */
  getIdentity(): Promise<Identity>
  /**
   * Calls `listener` after each change of who is signed in, once per change,
   * with no argument: read the answer from `getStatus()`.
   *
   * @returns A function that stops listening.
   */
  subscribe(listener: () => void): () => void
  /**
   * Signs in as `identityOrSeed`, or as the identity the auth last signed in
   * as when it is left out. The status changes before the promise is
   * returned, so a test need not await it, and listeners are told once.
   *
   * An argument that is neither a seed nor an identity, such as the options
   * object an `AuthClient` takes (`{ maxTimeToLive }`), is ignored: the auth
   * signs in as the identity it last signed in as, so a client that forwards
   * its own options does not change who signs in.
   */
  signIn(identityOrSeed?: Identity | number): Promise<Identity>
  /**
   * Signs out. Listeners are told once, unless nobody was signed in. The
   * auth remembers the identity, so a later `signIn()` returns to it.
   */
  signOut(): Promise<void>
  /**
   * Signs in as another identity in one step: listeners are told once and
   * never see a signed-out status in between, as when a user picks another
   * account in the identity provider.
   *
   * @returns The identity now signed in.
   * @throws {TypeError} When `identityOrSeed` is neither a seed nor an
   * identity: unlike `signIn()`, switching has no account to fall
   * back to.
   */
  switchTo(identityOrSeed: Identity | number): Identity
  /**
   * Ends the session of the identity the auth last signed in as, in another
   * tab or by running out its time, so the status becomes `expired`.
   * Listeners are told once, unless it already was.
   */
  expire(): void
  /**
   * Makes the identity the auth last signed in as signed in on this domain
   * but not held by this origin, so the status becomes `signed-in-elsewhere`.
   * Listeners are told once, unless it already was.
   */
  elsewhere(): void
  /**
   * Releases every listener. After it the auth tells nobody, and a
   * `subscribe()` listens to nothing.
   */
  dispose(): void
  /** Whether `dispose()` has been called. */
  readonly disposed: boolean
  /** How many listeners are subscribed. */
  readonly listenerCount: number
}

/** The 32 bytes a seed stands for: a constant secret with the seed on its end. */
function seedBytes(seed: number): Uint8Array {
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new RangeError(
      `createTestAuth: a seed is a non-negative integer, not ${seed}`
    )
  }
  // Never all zeros, which `Ed25519KeyIdentity` warns about.
  const bytes = new Uint8Array(32).fill(0xa5)
  new DataView(bytes.buffer).setBigUint64(24, BigInt(seed))
  return bytes
}

/**
 * The identity a seed or an identity stands for, or `undefined` for anything
 * else: a seed is a number, and an identity is an object that has a
 * `getPrincipal()`, which is all a caller of the auth reads from it.
 */
function identityOf(value: unknown): Identity | undefined {
  if (typeof value === "number") {
    return Ed25519KeyIdentity.generate(seedBytes(value))
  }
  return typeof value === "object" &&
    value !== null &&
    typeof (value as { getPrincipal?: unknown }).getPrincipal === "function"
    ? (value as Identity)
    : undefined
}

/** {@link identityOf}, or a `TypeError` naming the call that got no identity. */
function requireIdentity(call: string, value: unknown): Identity {
  const identity = identityOf(value)
  if (identity === undefined) {
    throw new TypeError(
      `${call}: expected an identity or a seed (a number), got ${
        value === null ? "null" : typeof value
      }`
    )
  }
  return identity
}

/** How long a test sign-in lasts: `AuthClient`'s default of eight hours. */
const SESSION_MS = 8 * 60 * 60 * 1000

const signedInAs = (account: Identity): TestAuthStatus => ({
  state: "signed-in",
  principal: account.getPrincipal(),
  expiresAtMs: Date.now() + SESSION_MS,
})

/**
 * Creates a sign-in a test controls, shaped like `@icp-sdk/auth` 10's
 * `AuthClient`: `getPrincipal()`, `getStatus()` (all four states),
 * `getIdentity()`, `subscribe()`, `signIn()`, `signOut()` and `dispose()`. It
 * can be handed to anything that takes one, with no adapter.
 *
 * On top of that it has the controls a test needs to play out what a user
 * does: `switchTo()` another identity, and `expire()` or `elsewhere()` the
 * session. A seed (`createTestAuth({ seed: 2 })`, `auth.switchTo(3)`) stands
 * for the same identity in every run.
 *
 * Every change is synchronous and reaches listeners once, so a test reads the
 * result without waiting.
 *
 * @param options - Who signs in at first, and whether the auth starts signed
 * in. Alone, it signs in as the identity of seed `1`.
 *
 * @example
 * ```typescript
 * const auth = createTestAuth({ seed: 1 })
 * const alice = auth.getPrincipal()
 *
 * auth.switchTo(2)
 * auth.getPrincipal() // another principal, after a single notification
 *
 * auth.expire()
 * auth.getStatus().state // "expired"
 * auth.getPrincipal() // undefined
 * ```
 */
export function createTestAuth(options: TestAuthOptions = {}): TestAuth {
  if (options.identity !== undefined && options.seed !== undefined) {
    throw new TypeError(
      "createTestAuth: pass `identity` or `seed`, not both, to say who signs in"
    )
  }
  const listeners = new Set<() => void>()
  let disposed = false

  // The account the auth last signed in as, which every state but
  // `signed-out` names and `signIn()` returns to.
  let account: Identity = requireIdentity(
    "createTestAuth",
    options.identity ?? options.seed ?? 1
  )
  let status: TestAuthStatus =
    options.signedIn === false ? { state: "signed-out" } : signedInAs(account)

  /** Replaces the status, and tells the listeners once. */
  function set(next: TestAuthStatus) {
    status = next
    // A copy: a listener may unsubscribe itself, or another, as it runs.
    for (const listener of [...listeners]) listener()
  }

  return {
    getPrincipal: () =>
      status.state === "signed-in" ? status.principal : undefined,
    getStatus: () => status,
    getIdentity: () =>
      Promise.resolve(
        status.state === "signed-in" ? account : new AnonymousIdentity()
      ),
    subscribe(listener) {
      if (disposed) return () => {}
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    signIn(identityOrSeed) {
      // Anything but a seed or an identity is options meant for a real
      // sign-in, so the auth signs in as the account it already has.
      account = identityOf(identityOrSeed) ?? account
      set(signedInAs(account))
      return Promise.resolve(account)
    },
    signOut() {
      if (status.state !== "signed-out") set({ state: "signed-out" })
      return Promise.resolve()
    },
    switchTo(identityOrSeed) {
      account = requireIdentity("switchTo", identityOrSeed)
      set(signedInAs(account))
      return account
    },
    expire() {
      if (status.state === "expired") return
      set({
        state: "expired",
        principal: account.getPrincipal(),
        expiresAtMs: Date.now(),
      })
    },
    elsewhere() {
      if (status.state === "signed-in-elsewhere") return
      set({
        state: "signed-in-elsewhere",
        principal: account.getPrincipal(),
        expiresAtMs: Date.now() + SESSION_MS,
      })
    },
    dispose() {
      disposed = true
      listeners.clear()
    },
    get disposed() {
      return disposed
    },
    get listenerCount() {
      return listeners.size
    },
  }
}
