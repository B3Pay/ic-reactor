// The wallet's world in a test: a real client from `createTestClient()` over
// its in-memory replica, with the backend and the ICP ledger mocked as plain
// functions that keep state per caller, and switches to fail or hold the next
// call of a method. No replica runs and nothing leaves the process.
//
// The client is built with `network: "env"`, as the app's is, on jsdom's page
// (http://localhost:3000), and the backend is found by `{ name: "backend" }`
// in an ic_env cookie written the way @ic-reactor/vite-plugin writes it.
import type { Principal } from "@candid-core/schema"
import type { Client } from "@ic-reactor/core"
import { createTestClient, type TestHandlers } from "@ic-reactor/core/testing"
import { ReactorProvider } from "@ic-reactor/react"
import { render } from "@testing-library/react"
import { StrictMode, type ReactNode } from "react"
import {
  actor as backendActor,
  type Actor as Backend,
  type Contact,
  type Refusal,
} from "../canisters/backend.ts"
import {
  actor as ledgerActor,
  type Account,
  type Actor as Ledger,
  type TransferArg,
  type TransferError,
} from "../canisters/ledger.ts"
import { ICP_LEDGER } from "../use-canisters.ts"

/** The backend's id in the tests' ic_env cookie. */
export const BACKEND_ID = "bkyz2-fmaaa-aaaaa-qaaaq-cai"

/** A local network's root key: the cookie needs one of the right length. */
const ROOT_KEY_HEX =
  "308182301d060d2b0601040182dc7c0503010201060c2b0601040182dc7c05030201036100a587ac27884f235a91ddd86927eec11e09872417231b41ab8fb95605c633af9702849c0ad6929613392b39c715fc232c0a0d8eb00a1ea91985b3e440bc9d0b78a5872f96dae753f395cd6602516ad58748d698958976c6c25b86c55aa30a3af9"

/** The principals of the test identities of seeds 1 and 2 (pinned by a test). */
export const SEED_1 =
  "psith-oknjz-x73tv-7x3p4-a2sji-7o6lo-g2754-yfgfl-3vlqe-irrrt-4ae"
export const SEED_2 =
  "xledz-fktfc-4ywwn-gai5u-ieqce-5x4qc-7lpel-o4ubn-ucngz-7lrzo-5ae"
/** Someone to pay. */
export const BOB = "aaaaa-aa"

/** The ICP ledger's fee: 0.0001 ICP. */
export const FEE = 10_000n
export const ICP = 100_000_000n

/**
 * Writes the ic_env cookie as the Vite plugin does: URI-encoded
 * `ic_root_key=<hex>&PUBLIC_CANISTER_ID:<name>=<id>&...`.
 */
export function setEnvCookie(ids: Readonly<Record<string, string>>): void {
  const entries = [
    `ic_root_key=${ROOT_KEY_HEX}`,
    ...Object.entries(ids).map(
      ([name, id]) => `PUBLIC_CANISTER_ID:${name}=${id}`
    ),
    "INTERNET_IDENTITY_PROVIDER=http://id.ai.localhost:8000/authorize",
  ]
  document.cookie = `ic_env=${encodeURIComponent(entries.join("&"))}; path=/`
}

export function clearEnvCookie(): void {
  document.cookie = "ic_env=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT"
}

/** What the next call of a method meets: a trap, or a reject with code 4. */
export type Fault = "trap" | "reject-4"

type TestClient = ReturnType<typeof createTestClient>

export interface TestWallet {
  readonly client: Client
  /** The test sign-in: `signIn(1)`, `switchTo(2)`, `signOut()`. */
  readonly auth: TestClient["auth"]
  /** Every request the in-memory replica received. */
  readonly requests: TestClient["requests"]
  /** Every argument `icrc1_transfer` was called with, in order. */
  readonly transfers: readonly TransferArg[]
  setBalance(owner: string, units: bigint): void
  balanceOf(owner: string): bigint
  /** Changes the fee the ledger charges (and reports, once read again). */
  setFee(units: bigint): void
  setName(owner: string, name: string): void
  addContact(owner: string, contact: Contact): void
  removeContact(owner: string, name: string): void
  contactsOf(owner: string): readonly Contact[]
  /** Makes the next call of `method` meet `fault`. */
  failNext(method: keyof Backend | keyof Ledger, fault: Fault): void
  /**
   * Holds the next call of `method` inside the canister until the returned
   * function is called, so a test can look at the page while it is in flight.
   */
  holdNext(method: keyof Backend | keyof Ledger): () => void
  /** Loses the reply to the next update: `outcome_unknown`. */
  dropNextReply(): void
  /** How many calls of `method` reached a canister (a query or a call). */
  callsOf(method: keyof Backend | keyof Ledger): number
}

const TX_WINDOW_NS = 24n * 60n * 60n * 1_000_000_000n

const hex = (bytes: Uint8Array | null) =>
  bytes === null
    ? "null"
    : `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`

/**
 * What the ledger deduplicates on, as ICRC-1's "Transaction deduplication"
 * has it: the whole transaction, so the sending account (caller and
 * `from_subaccount`), `to`, `amount`, `fee`, `memo` and `created_at_time`.
 * Two arguments that differ in any field, the memo included, are two
 * transfers.
 */
function transferKey(caller: Principal, arg: TransferArg): string {
  return [
    caller,
    hex(arg.from_subaccount),
    arg.to.owner,
    hex(arg.to.subaccount),
    arg.amount,
    arg.fee ?? "null",
    hex(arg.memo),
    arg.created_at_time,
  ].join("|")
}

export function createTestWallet(
  options: { signedIn?: boolean; cookie?: boolean } = {}
): TestWallet {
  if (options.cookie !== false) {
    setEnvCookie({ backend: BACKEND_ID, ledger: ICP_LEDGER })
  }
  const test = createTestClient({
    network: "env",
    identity: 1,
    signedIn: options.signedIn ?? true,
  })
  const { client, auth, mock, reject } = test

  const faults = new Map<string, Fault>()
  const holds = new Map<string, Promise<void>>()
  const transfers: TransferArg[] = []
  const balances = new Map<string, bigint>()
  const names = new Map<string, string>()
  const books = new Map<string, Contact[]>()
  const dedup = new Map<string, bigint>()
  let fee = FEE
  let nextBlock = 0n

  /** Runs the fault or the hold armed for `method`, if any. */
  const arrive = async (method: string) => {
    const hold = holds.get(method)
    if (hold) {
      holds.delete(method)
      await hold
    }
    const fault = faults.get(method)
    faults.delete(method)
    if (fault === "trap") throw new Error(`${method} trapped (test fault)`)
    if (fault === "reject-4") reject(4, `${method} rejected (test fault)`)
  }

  const accountKey = (account: Account) => account.owner
  const balanceOf = (owner: string) => balances.get(owner) ?? 0n
  const bookOf = (owner: string) => books.get(owner) ?? []
  const refuse = (value: Refusal) => ({ tag: "Err" as const, value })
  const checkName = (name: string): string | Refusal => {
    const trimmed = name.trim()
    return trimmed.length === 0 || trimmed.length > 32
      ? {
          tag: "InvalidName",
          value: "a name is 1 to 32 characters, with no control characters",
        }
      : trimmed
  }

  function transfer(arg: TransferArg, caller: Principal) {
    const err = (value: TransferError) => ({ tag: "Err" as const, value })
    const txKey = transferKey(caller, arg)
    if (arg.created_at_time !== null) {
      const now = BigInt(Date.now()) * 1_000_000n
      if (arg.created_at_time < now - TX_WINDOW_NS)
        return err({ tag: "TooOld" })
      const original = dedup.get(txKey)
      if (original !== undefined) {
        return err({ tag: "Duplicate", value: { duplicate_of: original } })
      }
    }
    if (arg.fee !== null && arg.fee !== fee) {
      return err({ tag: "BadFee", value: { expected_fee: fee } })
    }
    const balance = balanceOf(caller)
    if (balance < arg.amount + fee) {
      return err({ tag: "InsufficientFunds", value: { balance } })
    }
    balances.set(caller, balance - arg.amount - fee)
    balances.set(arg.to.owner, balanceOf(arg.to.owner) + arg.amount)
    const block = nextBlock++
    if (arg.created_at_time !== null) dedup.set(txKey, block)
    return { tag: "Ok" as const, value: block }
  }

  const ledger: TestHandlers<Ledger> = {
    icrc1_symbol: () => "ICP",
    icrc1_decimals: () => 8,
    icrc1_fee: () => fee,
    icrc1_balance_of: async (account) => {
      await arrive("icrc1_balance_of")
      return balanceOf(accountKey(account))
    },
    icrc1_transfer: async (arg, { caller }) => {
      await arrive("icrc1_transfer")
      transfers.push(arg)
      return transfer(arg, caller)
    },
  }
  mock<Ledger>(ledgerActor, ICP_LEDGER, ledger)

  // The backend of backend/src/lib.rs, rule for rule.
  const backend: TestHandlers<Backend> = {
    get_profile: async ({ caller }) => {
      await arrive("get_profile")
      const name = names.get(caller)
      return name === undefined ? null : { name }
    },
    set_name: async (name, { caller }) => {
      await arrive("set_name")
      if (caller === "2vxsx-fae") return refuse({ tag: "Anonymous" })
      const checked = checkName(name)
      if (typeof checked !== "string") return refuse(checked)
      names.set(caller, checked)
      return { tag: "Ok", value: { name: checked } }
    },
    contacts: async ({ caller }) => {
      await arrive("contacts")
      return [...bookOf(caller)]
    },
    add_contact: async (contact, { caller }) => {
      await arrive("add_contact")
      if (caller === "2vxsx-fae") return refuse({ tag: "Anonymous" })
      const name = checkName(contact.name)
      if (typeof name !== "string") return refuse(name)
      const book = bookOf(caller)
      if (book.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
        return refuse({ tag: "DuplicateName", value: name })
      }
      if (book.length >= 20) return refuse({ tag: "Full", value: 20 })
      books.set(caller, [...book, { name, owner: contact.owner }])
      return { tag: "Ok" }
    },
    remove_contact: async (name, { caller }) => {
      await arrive("remove_contact")
      if (caller === "2vxsx-fae") return refuse({ tag: "Anonymous" })
      const book = bookOf(caller)
      if (!book.some((c) => c.name === name)) {
        return refuse({ tag: "NotFound", value: name })
      }
      books.set(
        caller,
        book.filter((c) => c.name !== name)
      )
      return { tag: "Ok" }
    },
  }
  mock<Backend>(backendActor, BACKEND_ID, backend)

  return {
    client,
    auth,
    get requests() {
      return test.requests
    },
    transfers,
    setBalance: (owner, units) => void balances.set(owner, units),
    balanceOf,
    setFee: (units) => {
      fee = units
    },
    setName: (owner, name) => void names.set(owner, name),
    addContact: (owner, contact) =>
      void books.set(owner, [...bookOf(owner), contact]),
    removeContact: (owner, name) =>
      void books.set(
        owner,
        bookOf(owner).filter((c) => c.name !== name)
      ),
    contactsOf: bookOf,
    failNext: (method, fault) => void faults.set(method, fault),
    holdNext(method) {
      let release = () => {}
      holds.set(
        method,
        new Promise<void>((resolve) => {
          release = resolve
        })
      )
      return () => release()
    },
    dropNextReply: () => test.dropNextReply(),
    callsOf: (method) =>
      test.requests.filter(
        (r) =>
          (r.endpoint === "query" || r.endpoint === "call") &&
          r.methodName === method &&
          r.refused === undefined
      ).length,
  }
}

/** Renders `ui` under a provider that borrows the wallet's client. */
export function renderWithWallet(wallet: TestWallet, ui: ReactNode) {
  return render(
    <StrictMode>
      <ReactorProvider client={() => wallet.client}>{ui}</ReactorProvider>
    </StrictMode>
  )
}

/** Generous, for the in-memory replica's signatures and certificates. */
export const patiently = { timeout: 5_000 }
