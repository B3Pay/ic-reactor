// Scenario 3: a sign-in source of the app's own, as an `AuthLike`.
//
// "Dev account (local only)" signs in without a passkey: an Ed25519 key this
// tab makes and keeps in sessionStorage. It is how a person or a script demos
// the wallet on a local network (passkeys cannot be made in an automated
// browser), and how an account gets test ICP: `pnpm faucet <its principal>`.
//
// The client takes any sign-in that has the six methods of `AuthLike`
// (`getPrincipal`, `getStatus`, `getIdentity`, `subscribe`, `signIn`,
// `signOut`), plus `dispose` if it holds anything. This object is one, with no
// adapter; `wallet-auth.ts` puts it next to Internet Identity behind one
// `auth`. Two rules it keeps for the client:
//
// - `getIdentity()` returns the same object until the account changes: the
//   client builds one agent per identity object it is handed.
// - Every change of who is signed in reaches `subscribe()`'s listeners once,
//   and `getStatus()`/`getPrincipal()` already say the new answer when they
//   run.
//
// Never offer this on a deployed site: the key is readable by any script on
// the page. `main.tsx` makes it only when the page is local.
import type { AuthLike } from "@ic-reactor/core"
import { AnonymousIdentity, type Identity } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"

/** Where the accounts of this tab are kept. */
export const DEV_ACCOUNTS_KEY = "vite-wallet:dev-accounts"

/** The storage this reads and writes: `sessionStorage` in the app. */
export type AccountStorage = Pick<Storage, "getItem" | "setItem">

/** One dev account: its number in this tab, and its principal. */
export interface DevAccount {
  readonly number: number
  readonly principal: string
}

/** What `signIn()` takes: an account number, or none for the last one used. */
export interface DevSignIn {
  readonly account?: number
}

export interface DevAccounts extends AuthLike {
  /** The accounts this tab has made, numbered from 1. */
  list(): readonly DevAccount[]
  /** The number of the account whose principal is `principal`, if it is one. */
  numberOf(principal: string): number | undefined
  /**
   * Signs in as account `account`, made on first use; with no account, the
   * one signed in last (account 1 the first time). Signed in as one account,
   * signing in as another is a switch: listeners hear one change, never a
   * signed-out state in between. `account` may be at most one past the last
   * account made.
   */
  signIn(options?: DevSignIn): Promise<void>
  /** Signs out. The keys stay, so signing in again returns to the same principals. */
  signOut(): Promise<void>
}

/** What is kept: the 32-byte seed of each account, and who is signed in. */
interface Saved {
  readonly seeds: readonly string[]
  readonly signedIn: number | null
  readonly last: number | null
}

const EMPTY: Saved = { seeds: [], signedIn: null, last: null }

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")

const fromHex = (hex: string) =>
  Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16))

/** What `storage` holds, or nothing when it holds something else. */
function read(storage: AccountStorage): Saved {
  try {
    const saved: unknown = JSON.parse(
      storage.getItem(DEV_ACCOUNTS_KEY) ?? "null"
    )
    if (
      typeof saved === "object" &&
      saved !== null &&
      "seeds" in saved &&
      Array.isArray(saved.seeds) &&
      saved.seeds.every(
        (seed: unknown) =>
          typeof seed === "string" && /^[0-9a-f]{64}$/.test(seed)
      )
    ) {
      const seeds: string[] = saved.seeds
      const valid = (n: unknown): number | null =>
        typeof n === "number" &&
        Number.isInteger(n) &&
        n >= 1 &&
        n <= seeds.length
          ? n
          : null
      return {
        seeds,
        signedIn: "signedIn" in saved ? valid(saved.signedIn) : null,
        last: "last" in saved ? valid(saved.last) : null,
      }
    }
  } catch {
    // Not JSON: start over.
  }
  return EMPTY
}

/** The account number `options` asks for, or why it is not one. */
function accountIn(options: unknown): number | undefined {
  if (options === undefined || options === null) return undefined
  const account = (options as { account?: unknown }).account
  if (account === undefined) return undefined
  if (
    typeof account !== "number" ||
    !Number.isInteger(account) ||
    account < 1
  ) {
    throw new TypeError(
      `A dev account is a number from 1, got ${String(account)}.`
    )
  }
  return account
}

/**
 * The dev accounts of one tab, kept in `storage`.
 *
 * @param newSeed - Makes the 32 secret bytes of a new account. Tests pass a
 * fixed one; the app uses the browser's random numbers.
 */
export function createDevAccounts(
  storage: AccountStorage,
  newSeed: () => Uint8Array = () => crypto.getRandomValues(new Uint8Array(32))
): DevAccounts {
  let saved = read(storage)
  const identities = new Map<number, Identity>()
  const listeners = new Set<() => void>()
  const anonymous = new AnonymousIdentity()

  /** The identity of account `n`: one object per account, made once. */
  const identityOf = (n: number): Identity => {
    let identity = identities.get(n)
    if (identity === undefined) {
      const seed = saved.seeds[n - 1]
      if (seed === undefined) throw new RangeError(`No dev account ${n}.`)
      identity = Ed25519KeyIdentity.generate(fromHex(seed))
      identities.set(n, identity)
    }
    return identity
  }

  const change = (next: Saved) => {
    saved = next
    storage.setItem(DEV_ACCOUNTS_KEY, JSON.stringify(next))
    // A copy: a listener may unsubscribe as it runs.
    for (const listener of [...listeners]) listener()
  }

  return {
    getPrincipal: () =>
      saved.signedIn === null
        ? undefined
        : identityOf(saved.signedIn).getPrincipal(),
    getStatus: () => ({
      state: saved.signedIn === null ? "signed-out" : "signed-in",
    }),
    getIdentity: async () =>
      saved.signedIn === null ? anonymous : identityOf(saved.signedIn),
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async signIn(options?: DevSignIn) {
      const account = accountIn(options) ?? saved.last ?? 1
      if (account > saved.seeds.length + 1) {
        throw new RangeError(
          `Make dev account ${saved.seeds.length + 1} before account ${account}.`
        )
      }
      if (saved.signedIn === account) return
      const seeds =
        account === saved.seeds.length + 1
          ? [...saved.seeds, toHex(newSeed())]
          : saved.seeds
      change({ seeds, signedIn: account, last: account })
    },
    async signOut() {
      if (saved.signedIn !== null) change({ ...saved, signedIn: null })
    },
    list: () =>
      saved.seeds.map((_seed, i) => ({
        number: i + 1,
        principal: identityOf(i + 1)
          .getPrincipal()
          .toText(),
      })),
    numberOf(principal) {
      const index = saved.seeds.findIndex(
        (_seed, i) =>
          identityOf(i + 1)
            .getPrincipal()
            .toText() === principal
      )
      return index === -1 ? undefined : index + 1
    },
    // No `dispose()`: the accounts belong to the tab, not to a client, and a
    // client that is disposed removes its listener through the function
    // `subscribe()` returned.
  }
}
