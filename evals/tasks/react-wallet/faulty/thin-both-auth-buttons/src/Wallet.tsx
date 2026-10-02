import {
  useMemo,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactElement,
} from "react"
import {
  QueryClient,
  QueryClientProvider,
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { HttpAgent, type Identity } from "@icp-sdk/core/agent"
import { Principal } from "@icp-sdk/core/principal"
import { ActorError, createActor } from "@candid-core/schema/actor"
import { httpTransport } from "@candid-core/schema/transport-icp"
import { actor, type Actor, type TransferError } from "./generated/icrc1"
import type { WalletAuth } from "./auth"
import type { LedgerConfig } from "./config"

export interface WalletProps {
  auth: WalletAuth
  config: LedgerConfig
}

const NAT64_MAX = 18_446_744_073_709_551_615n
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$/

function parseAmount(text: string): bigint | undefined {
  const match = /^(\d+)(?:\.(\d{1,8}))?$/.exec(text.trim())
  if (!match) return undefined
  const units =
    BigInt(match[1]) * 100_000_000n + BigInt((match[2] ?? "").padEnd(8, "0"))
  return units <= NAT64_MAX ? units : undefined
}

function formatE8s(value: bigint): string {
  return `${value / 100_000_000n}.${(value % 100_000_000n).toString().padStart(8, "0")}`
}

function parsePrincipal(text: string): Principal | undefined {
  try {
    return Principal.fromText(text.trim())
  } catch {
    return undefined
  }
}

/** The ledger answered with `Err`: certainly not executed. */
class LedgerRefused extends Error {
  constructor(readonly err: TransferError) {
    super(`ledger refused: ${err.tag}`)
  }
}

/** Whether a failed transfer may still have been executed by the ledger. */
function mayHaveExecuted(error: unknown): boolean {
  if (error instanceof LedgerRefused) return false
  if (error instanceof ActorError) return !error.message.startsWith("encode")
  const shape = error as {
    code?: { name?: unknown; rejectCode?: unknown; status?: unknown }
  }
  const rejectCode = shape?.code?.rejectCode
  // Reject codes 1-3 come from the system before any canister code runs;
  // 4 and 5 come from the canister's own code, which may have committed.
  if (typeof rejectCode === "number") return rejectCode > 3
  if (
    shape?.code?.name === "HttpErrorCode" &&
    typeof shape.code.status === "number"
  ) {
    const status = shape.code.status
    return !(status >= 400 && status < 500 && status !== 408)
  }
  return true
}

function makeLedger(config: LedgerConfig, identity: Identity): Actor {
  const local = LOCAL.test(new URL(config.host).hostname)
  const agent = HttpAgent.createSync({
    host: config.host,
    identity,
    ...(config.rootKey ? { rootKey: config.rootKey } : {}),
    shouldFetchRootKey: !config.rootKey && local,
  })
  return createActor<Actor>(actor, config.canisterId, httpTransport({ agent }))
}

export function Wallet({ auth, config }: WalletProps): ReactElement {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={queryClient}>
      <WalletView auth={auth} config={config} />
    </QueryClientProvider>
  )
}

function WalletView({ auth, config }: WalletProps): ReactElement {
  const queryClient = useQueryClient()
  const identity = useSyncExternalStore(
    (listener) => auth.subscribe(listener),
    () => auth.getIdentity()
  )
  const signedIn =
    auth.isAuthenticated() && !identity.getPrincipal().isAnonymous()
  const principal = signedIn ? identity.getPrincipal().toText() : null
  // One agent per identity: a call always goes out as the identity it was built for.
  const ledger = useMemo(() => makeLedger(config, identity), [config, identity])

  const balance = useQuery({
    // The principal is in the key, so one principal's balance is never
    // served under another's.
    queryKey: ["icrc1_balance_of", config.canisterId, principal],
    queryFn: principal
      ? () =>
          ledger.icrc1_balance_of({
            owner: Principal.fromText(principal),
            subaccount: null,
          })
      : skipToken,
  })

  const transfer = useMutation({
    mutationFn: async ({ to, amount }: { to: Principal; amount: bigint }) => {
      const result = await ledger.icrc1_transfer({
        to: { owner: to, subaccount: null },
        amount,
        fee: null,
        memo: null,
        from_subaccount: null,
        created_at_time: null,
      })
      if (result.tag === "Err") throw new LedgerRefused(result.value)
      return result.value
    },
    retry: false,
    onSettled: async (_data, error) => {
      if (!error || mayHaveExecuted(error)) {
        await queryClient.invalidateQueries({ queryKey: ["icrc1_balance_of"] })
      }
    },
  })

  const [to, setTo] = useState("")
  const [amount, setAmount] = useState("")
  const [refusal, setRefusal] = useState<string | null>(null)

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!signedIn) return setRefusal("Sign in first.")
    const units = parseAmount(amount)
    if (units === undefined)
      return setRefusal("Enter an amount with at most 8 decimals.")
    const recipient = parsePrincipal(to)
    if (!recipient) return setRefusal("Enter a valid principal.")
    setRefusal(null)
    transfer.mutate({ to: recipient, amount: units })
  }

  const state = refusal
    ? "error"
    : transfer.status === "error"
      ? mayHaveExecuted(transfer.error)
        ? "unknown"
        : "error"
      : transfer.status

  return (
    <div>
      <button data-testid="signout" onClick={() => void auth.logout()}>
        Sign out
      </button>
      <button data-testid="signin" onClick={() => void auth.login()}>
        Sign in
      </button>
      {signedIn && balance.data !== undefined && (
        <p>
          Balance: <span data-testid="balance">{formatE8s(balance.data)}</span>
        </p>
      )}
      <form onSubmit={onSubmit}>
        <input
          data-testid="transfer-to"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <input
          data-testid="transfer-amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button
          data-testid="transfer-submit"
          type="submit"
          disabled={transfer.isPending}
        >
          Send
        </button>
      </form>
      <p data-testid="transfer-status" data-state={state}>
        {refusal ??
          (state === "unknown"
            ? "The transfer may or may not have happened; the balance was refreshed."
            : (transfer.error?.message ?? ""))}
      </p>
    </div>
  )
}
