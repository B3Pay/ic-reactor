import {
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactElement,
} from "react"
import {
  QueryClientProvider,
  skipToken,
  useMutation,
  useQuery,
} from "@tanstack/react-query"
import {
  createClient,
  formatUnits,
  parseUnits,
  type AuthLike,
  type Client,
} from "@ic-reactor/core"
import { isPrincipal, principal } from "@candid-core/schema"
import { actor, type Actor } from "./generated/icrc1"
import type { WalletAuth } from "./auth"
import type { LedgerConfig } from "./config"

export interface WalletProps {
  auth: WalletAuth
  config: LedgerConfig
}

const NAT64_MAX = 18_446_744_073_709_551_615n

function parseAmount(text: string): bigint | undefined {
  let units: bigint
  try {
    units = parseUnits(text, 8)
  } catch {
    return undefined
  }
  return units <= NAT64_MAX ? units : undefined
}

/**
 * The wallet's sign-in as the client reads one. Signed in only while the
 * wallet says so with an identity that is not anonymous.
 */
function walletAuthLike(auth: WalletAuth): AuthLike {
  const signedIn = () =>
    auth.isAuthenticated() && !auth.getIdentity().getPrincipal().isAnonymous()
  return {
    getPrincipal: () =>
      signedIn() ? auth.getIdentity().getPrincipal() : undefined,
    getStatus: () => ({ state: signedIn() ? "signed-in" : "signed-out" }),
    getIdentity: async () => auth.getIdentity(),
    subscribe: (listener) => auth.subscribe(listener),
    signIn: () => auth.login(),
    signOut: () => auth.logout(),
  }
}

// The app's client lives at module scope, built on first render and bound to
// the app's one auth. ReactorProvider disposes the client its factory returns
// when its tree unmounts, so a client that outlives the tree is given to
// TanStack's provider directly, and its sign-in state is read from it.
let shared: Client | undefined

export function Wallet({ auth, config }: WalletProps): ReactElement {
  const client = (shared ??= createClient({
    network: { host: config.host, rootKey: config.rootKey },
    auth: () => walletAuthLike(auth),
  }))
  return (
    <QueryClientProvider client={client.queryClient}>
      <WalletView client={client} canisterId={config.canisterId} />
    </QueryClientProvider>
  )
}

function WalletView(props: { client: Client; canisterId: string }) {
  const { client, canisterId } = props
  const ledger = client.canister<Actor>(actor, { id: canisterId })
  const { status, principal: caller } = useSyncExternalStore(
    client.subscribe,
    client.authState
  )
  const signedIn = status === "signed-in"
  const signIn = () => client.signIn()
  const signOut = () => client.signOut()

  const balance = useQuery(
    client.queryOptions(
      ledger,
      "icrc1_balance_of",
      signedIn ? { owner: principal(caller), subaccount: null } : skipToken
    )
  )
  const transfer = useMutation(client.mutationOptions(ledger, "icrc1_transfer"))

  const [to, setTo] = useState("")
  const [amount, setAmount] = useState("")
  const [refusal, setRefusal] = useState<string | null>(null)

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!signedIn) return setRefusal("Sign in first.")
    const units = parseAmount(amount)
    if (units === undefined)
      return setRefusal("Enter an amount with at most 8 decimals.")
    const recipient = to.trim()
    if (!isPrincipal(recipient)) return setRefusal("Enter a valid principal.")
    setRefusal(null)
    transfer.mutate({
      to: { owner: recipient, subaccount: null },
      amount: units,
      fee: null,
      memo: null,
      from_subaccount: null,
      created_at_time: null,
    })
  }

  const state = refusal
    ? "error"
    : transfer.error
      ? transfer.error.mayHaveExecuted
        ? "unknown"
        : "error"
      : transfer.status

  return (
    <div>
      {signedIn ? (
        <button data-testid="signout" onClick={() => void signOut()}>
          Sign out
        </button>
      ) : (
        <button data-testid="signin" onClick={() => void signIn()}>
          Sign in
        </button>
      )}
      {signedIn && balance.data !== undefined && (
        <p>
          Balance:{" "}
          <span data-testid="balance">
            {formatUnits(balance.data, 8, { minFractionDigits: 8 })}
          </span>
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
          (transfer.error?.kind === "canister_err"
            ? `Refused by the ledger: ${transfer.error.err.tag}`
            : (transfer.error?.message ?? ""))}
      </p>
    </div>
  )
}
