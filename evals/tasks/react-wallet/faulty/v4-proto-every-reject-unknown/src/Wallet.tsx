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
} from "@tanstack/react-query"
import {
  createClient,
  isPrincipalText,
  type Client,
} from "@ic-reactor/v4-proto"
import { LedgerService } from "./generated/icrc1.service"
import type { WalletAuth } from "./auth"
import type { LedgerConfig } from "./config"

export interface WalletProps {
  auth: WalletAuth
  config: LedgerConfig
}

const NAT64_MAX = 18_446_744_073_709_551_615n

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

export function Wallet({ auth, config }: WalletProps): ReactElement {
  const [queryClient] = useState(() => new QueryClient())
  const client = useMemo(
    () =>
      createClient({
        network: { host: config.host, rootKey: config.rootKey },
        auth,
      }),
    [auth, config.host, config.rootKey]
  )
  return (
    <QueryClientProvider client={queryClient}>
      <WalletView client={client} auth={auth} canisterId={config.canisterId} />
    </QueryClientProvider>
  )
}

function WalletView(props: {
  client: Client
  auth: WalletAuth
  canisterId: string
}) {
  const { client, auth, canisterId } = props
  const ledger = useMemo(
    () => client.canister(LedgerService, { id: canisterId }),
    [client, canisterId]
  )
  const caller = useSyncExternalStore(client.subscribe, client.caller)
  const signedIn = client.isAuthenticated()

  const balance = useQuery(
    ledger.icrc1_balance_of.queryOptions(
      signedIn ? [{ owner: caller, subaccount: null }] : skipToken
    )
  )
  const transfer = useMutation(
    ledger.icrc1_transfer.mutationOptions({
      invalidates: [ledger.icrc1_balance_of],
    })
  )

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
    if (!isPrincipalText(recipient))
      return setRefusal("Enter a valid principal.")
    setRefusal(null)
    transfer.mutate([
      {
        to: { owner: recipient, subaccount: null },
        amount: units,
        fee: null,
        memo: null,
        from_subaccount: null,
        created_at_time: null,
      },
    ])
  }

  const state = refusal
    ? "error"
    : transfer.error
      ? transfer.error.mayHaveExecuted || transfer.error.kind === "rejected"
        ? "unknown"
        : "error"
      : transfer.status

  return (
    <div>
      {signedIn ? (
        <button data-testid="signout" onClick={() => void auth.logout()}>
          Sign out
        </button>
      ) : (
        <button data-testid="signin" onClick={() => void auth.login()}>
          Sign in
        </button>
      )}
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
          (transfer.error?.kind === "canister_err"
            ? `Refused by the ledger: ${transfer.error.err.tag}`
            : (transfer.error?.message ?? ""))}
      </p>
    </div>
  )
}
