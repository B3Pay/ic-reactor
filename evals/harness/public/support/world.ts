// A local test world: a fake Internet Computer replica (./fake-replica.js)
// running a small ICRC-1 ledger with the interface in ./ledger.idl.js.
//
// The replica answers the IC HTTP API at `world.host` through
// `globalThis.fetch`, and signs certificates and query responses with its own
// root key (`world.rootKey`), so an agent built with that host and root key
// talks to it exactly as it would talk to a replica.
//
// One replica serves a whole test file: it is installed when this module is
// first imported (import it before the code under test), and `createWorld()`
// gives each test a fresh ledger and request log behind it.
import { Cbor } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { Principal } from "@icp-sdk/core/principal"
import { installFakeReplica, type FakeCallContext } from "./fake-replica.js"
import { idlFactory } from "./ledger.idl.js"

export const LEDGER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"
export const HOST = "http://127.0.0.1:4943"
export const FEE = 10_000n

export interface LoggedRequest {
  readonly endpoint: "status" | "query" | "call" | "read_state"
  readonly method?: string
  readonly sender?: string
}

export interface TestWorld {
  readonly host: string
  readonly rootKey: Uint8Array
  readonly canisterId: string
  /** Set the balance, in base units, of an owner's default account. */
  setBalance(owner: string, e8s: bigint): void
  balanceOf(owner: string): bigint
  /** Every request an agent sent since `createWorld()`. */
  readonly requests: readonly LoggedRequest[]
  /** A new random signing identity. */
  newIdentity(): Ed25519KeyIdentity
}

interface Account {
  owner: Principal
  subaccount: [] | [Uint8Array]
}
interface TransferArg {
  to: Account
  amount: bigint
  fee: [] | [bigint]
  memo: [] | [Uint8Array]
  from_subaccount: [] | [Uint8Array]
  created_at_time: [] | [bigint]
}

const keyOf = (owner: Principal, sub: [] | [Uint8Array]) => {
  const bytes = sub[0]
  if (!bytes || bytes.every((b) => b === 0)) return owner.toText()
  return `${owner.toText()}:${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`
}

let balances = new Map<string, bigint>()
let requests: LoggedRequest[] = []
let nextBlock = 0n

const ledger: Record<
  string,
  (args: unknown[], context: FakeCallContext) => unknown
> = {
  icrc1_name: () => "Test Token",
  icrc1_symbol: () => "TST",
  icrc1_decimals: () => 8,
  icrc1_fee: () => FEE,
  icrc1_metadata: () => [],
  icrc1_total_supply: () => [...balances.values()].reduce((a, b) => a + b, 0n),
  icrc1_minting_account: () => [],
  icrc1_supported_standards: () => [
    { name: "ICRC-1", url: "https://github.com/dfinity/ICRC-1" },
  ],
  icrc1_balance_of: ([account]) => {
    const { owner, subaccount } = account as Account
    return balances.get(keyOf(owner, subaccount)) ?? 0n
  },
  icrc1_transfer: ([raw], { caller }) => {
    const arg = raw as TransferArg
    const from = keyOf(caller, arg.from_subaccount)
    if (arg.fee[0] !== undefined && arg.fee[0] !== FEE) {
      return { Err: { BadFee: { expected_fee: FEE } } }
    }
    const balance = balances.get(from) ?? 0n
    if (balance < arg.amount + FEE) {
      return { Err: { InsufficientFunds: { balance } } }
    }
    const to = keyOf(arg.to.owner, arg.to.subaccount)
    balances.set(from, balance - arg.amount - FEE)
    balances.set(to, (balances.get(to) ?? 0n) + arg.amount)
    return { Ok: nextBlock++ }
  },
}

const service = idlFactory({ IDL }) as IDL.ServiceClass
const funcs = new Map<string, IDL.FuncClass>(
  service._fields as Array<[string, IDL.FuncClass]>
)

function run(
  kind: "query" | "update",
  method: string,
  arg: Uint8Array,
  context: FakeCallContext
) {
  const func = funcs.get(method)
  const impl = ledger[method]
  if (!func || !impl) throw new Error(`the ledger has no method ${method}`)
  if (kind === "query" && !func.annotations.includes("query")) {
    throw new Error(`${method} is not a query`)
  }
  const result = impl(IDL.decode(func.argTypes, arg), context)
  return new Uint8Array(IDL.encode(func.retTypes, [result]))
}

const original = globalThis.fetch
const replica = installFakeReplica({
  host: HOST,
  canisters: {
    [LEDGER_ID]: {
      query: (method, arg, context) => run("query", method, arg, context),
      update: (method, arg, context) => run("update", method, arg, context),
    },
  },
})
const fake = globalThis.fetch

// Log each request in front of the replica. This `fetch` stays installed for
// the whole file, so agents built at module scope keep working across tests.
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  const match =
    /\/api\/v\d+\/(?:canister\/[^/]+\/(query|call|read_state)|(status))$/.exec(
      url.pathname
    )
  if (!match) return original(input, init)
  if (match[2]) {
    requests.push({ endpoint: "status" })
    return fake(input, init)
  }
  const body = new Uint8Array(
    await new Response(
      input instanceof Request ? input.body : (init?.body as BodyInit)
    ).arrayBuffer()
  )
  const { content } = Cbor.decode(body) as {
    content: { sender?: Uint8Array; method_name?: string }
  }
  requests.push({
    endpoint: match[1] as LoggedRequest["endpoint"],
    method: content.method_name,
    sender: content.sender
      ? Principal.fromUint8Array(content.sender).toText()
      : undefined,
  })
  return fake(url, { ...init, method: "POST", body: body as BodyInit })
}) as typeof globalThis.fetch

/** A fresh ledger and request log for one test. */
export function createWorld(): TestWorld {
  balances = new Map()
  requests = []
  return {
    host: replica.host,
    rootKey: replica.rootKey,
    canisterId: LEDGER_ID,
    setBalance: (owner, e8s) => void balances.set(owner, e8s),
    balanceOf: (owner) => balances.get(owner) ?? 0n,
    get requests() {
      return requests
    },
    newIdentity: () => Ed25519KeyIdentity.generate(),
  }
}
