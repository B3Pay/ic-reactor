import {
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactElement,
} from "react"
import {
  ClientManager,
  Reactor,
  createActorHooks,
  formatTokenAmount,
  parseTokenAmount,
  reactorRetry,
  skipToken,
} from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"
import type { Identity } from "@icp-sdk/core/agent"
import { Principal } from "@icp-sdk/core/principal"
import { idlFactory, type _SERVICE } from "./declarations/icrc1.did"
import type { WalletAuth } from "./auth"
import type { LedgerConfig } from "./config"

export interface WalletProps {
  auth: WalletAuth
  config: LedgerConfig
}

const NAT64_MAX = 18_446_744_073_709_551_615n

function parseAmount(text: string): bigint | undefined {
  if (!/^\d+(\.\d+)?$/.test(text.trim())) return undefined
  try {
    const units = parseTokenAmount(text.trim(), 8)
    return units <= NAT64_MAX ? units : undefined
  } catch {
    return undefined
  }
}

function parsePrincipal(text: string): Principal | undefined {
  try {
    return Principal.fromText(text.trim())
  } catch {
    return undefined
  }
}

/** One ClientManager, reactor and hook set per mounted wallet. */
function buildLedger(config: LedgerConfig, identity: Identity) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: reactorRetry } },
  })
  const clientManager = new ClientManager({
    queryClient,
    agentOptions: {
      host: config.host,
      ...(config.rootKey ? { rootKey: config.rootKey } : {}),
    },
  })
  clientManager.updateAgent(identity)
  const reactor = new Reactor<_SERVICE>({
    clientManager,
    idlFactory,
    name: "ledger",
    canisterId: config.canisterId,
  })
  return { clientManager, reactor, hooks: createActorHooks(reactor) }
}

export function Wallet({ auth, config }: WalletProps): ReactElement {
  const [ledger] = useState(() => buildLedger(config, auth.getIdentity()))
  // Install every identity change on the agent as it happens, before React
  // renders with it: updateAgent also drops the previous principal's cache.
  useEffect(() => {
    ledger.clientManager.updateAgent(auth.getIdentity())
    return auth.subscribe(() =>
      ledger.clientManager.updateAgent(auth.getIdentity())
    )
  }, [auth, ledger])
  return <WalletView auth={auth} ledger={ledger} />
}

function WalletView({
  auth,
  ledger,
}: {
  auth: WalletAuth
  ledger: ReturnType<typeof buildLedger>
}): ReactElement {
  const { useActorQuery, useActorMutation } = ledger.hooks
  const identity = useSyncExternalStore(
    (listener) => auth.subscribe(listener),
    () => auth.getIdentity()
  )
  const signedIn =
    auth.isAuthenticated() && !identity.getPrincipal().isAnonymous()
  const owner = signedIn ? identity.getPrincipal() : undefined

  const balance = useActorQuery({
    functionName: "icrc1_balance_of",
    args: owner ? [{ owner, subaccount: [] }] : skipToken,
  })
  const transfer = useActorMutation({
    functionName: "icrc1_transfer",
    invalidateQueries: [{ functionName: "icrc1_balance_of" }],
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
    transfer.mutate([
      {
        to: { owner: recipient, subaccount: [] },
        amount: units,
        fee: [],
        memo: [],
        from_subaccount: [],
        created_at_time: [],
      },
    ])
  }

  const state = refusal ? "error" : transfer.status

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
          Balance:{" "}
          <span data-testid="balance">
            {formatTokenAmount(balance.data, 8, {
              minFractionDigits: 8,
              maxFractionDigits: 8,
            })}
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
        {refusal ?? transfer.error?.message ?? ""}
      </p>
    </div>
  )
}
