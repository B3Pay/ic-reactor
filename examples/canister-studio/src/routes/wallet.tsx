import { useAuth, useClient } from "@ic-reactor/react"
import {
  ClientOnly,
  createFileRoute,
  Link,
  stripSearchParams,
} from "@tanstack/react-router"
import type { ReactElement } from "react"
import { z } from "zod"
import { Card } from "../components/Card.tsx"
import { Notice } from "../components/Notice.tsx"
import { RouteError } from "../components/RouteError.tsx"
import { SectionBoundary } from "../components/SectionBoundary.tsx"
import { Skeleton } from "../components/Spinner.tsx"
import { BalancePanel } from "../components/wallet/BalancePanel.tsx"
import {
  LedgerSummary,
  WithLedgerToken,
} from "../components/wallet/LedgerSummary.tsx"
import {
  ledgerCanister,
  ledgerMetaReads,
  minterCanister,
  WALLET_LEDGER_KEYS,
  WALLET_LEDGERS,
  type WalletLedgerKey,
} from "../components/wallet/ledgers.ts"
import { MinterPanel } from "../components/wallet/MinterPanel.tsx"
import { SendPanel } from "../components/wallet/SendPanel.tsx"

const searchSchema = z.object({
  ledger: z.enum(WALLET_LEDGER_KEYS).default("icp").catch("icp"),
})

const LEDGER_LABEL: Readonly<Record<WalletLedgerKey, string>> = {
  icp: "ICP",
  ckbtc: "ckBTC",
  cketh: "ckETH",
}

// How long a server render waits for the ledger's metadata. Past it, the
// page streams it in instead.
const METADATA_BUDGET_MS = 3_000

// Never fails: a read that fails here is read again by the browser, which
// shows the real error.
const settle = (pending: Promise<unknown>): Promise<unknown> =>
  pending.catch(() => undefined)

export const Route = createFileRoute("/wallet")({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams({ ledger: "icp" })] },
  loaderDeps: ({ search }) => ({ ledger: search.ledger }),
  // The ledger's public metadata is the same for everyone, and the whole
  // page needs it (amounts are parsed with the ledger's own decimals): the
  // server waits for it, briefly, so it is in the first HTML; past the
  // budget it streams. Balances need a caller, which a server never has, so
  // they load in the browser after hydration.
  loader: async ({ context: { reactor, queryClient }, deps }) => {
    const entry = WALLET_LEDGERS[deps.ledger]
    const reads = ledgerMetaReads(reactor, entry.id)
    const metadata = Promise.all([
      settle(queryClient.query(reads.name)),
      settle(queryClient.query(reads.symbol)),
      settle(queryClient.query(reads.decimals)),
      settle(queryClient.query(reads.fee)),
    ])
    if (deps.ledger === "ckbtc") {
      void settle(
        queryClient.query(
          reactor.queryOptions(minterCanister(reactor), "get_minter_info")
        )
      )
    }
    // In the browser the page's skeleton shows the wait instead.
    if (typeof document !== "undefined") return
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      metadata,
      new Promise((resolve) => {
        timer = setTimeout(resolve, METADATA_BUDGET_MS)
      }),
    ])
    clearTimeout(timer)
  },
  head: ({ match }) => ({
    meta: [
      {
        title: `${LEDGER_LABEL[match.search.ledger]} wallet · Canister Studio`,
      },
      {
        name: "description",
        content:
          "A typed wallet over generated ICRC-1 types: caller-scoped balances, a typed transfer form with a confirm step, and the safe re-send after an unknown outcome.",
      },
    ],
  }),
  errorComponent: (props) => (
    <RouteError {...props} title="The wallet failed" />
  ),
  pendingComponent: () => (
    <div className="page wallet">
      <header className="page-header">
        <h1 className="page-title">Wallet</h1>
      </header>
      <WalletSkeleton />
    </div>
  ),
  component: WalletPage,
})

function WalletPage(): ReactElement {
  const { ledger } = Route.useSearch()
  const entry = WALLET_LEDGERS[ledger]
  const auth = useAuth()
  const client = useClient()
  const signedIn = auth.status === "signed-in"

  const readBack = (): void => {
    void client.queryClient.invalidateQueries({
      queryKey: client.queryKey(
        ledgerCanister(client, entry.id),
        "icrc1_balance_of"
      ),
    })
  }

  return (
    <div className="page wallet">
      <header className="page-header">
        <h1 className="page-title">Wallet</h1>
        <p className="page-subtitle">
          Hand-written flows over the generated ICRC-1 module: typed reads and
          writes, no casts. The forms come from the same schemas the calls
          encode with.
        </p>
      </header>

      <nav className="segmented wallet-ledgers" aria-label="Ledger">
        {WALLET_LEDGER_KEYS.map((key) => (
          <Link
            key={key}
            to="/wallet"
            search={{ ledger: key }}
            className="wallet-ledger-link"
            aria-current={key === ledger ? "page" : undefined}
            activeProps={{}}
          >
            {LEDGER_LABEL[key]}
          </Link>
        ))}
      </nav>

      {!signedIn && (
        <Notice tone="info" title="You are browsing anonymously">
          <p>
            Reads work for anyone. Writes need a signed-in caller: the client
            refuses a write from the anonymous principal before sending it (
            <code className="code-inline">unauthenticated</code>), so the send
            form stays disabled until you sign in.
          </p>
        </Notice>
      )}

      <SectionBoundary
        label={`The ${LEDGER_LABEL[ledger]} ledger`}
        fallback={<WalletSkeleton />}
        resetKey={ledger}
      >
        <WithLedgerToken entry={entry}>
          {(token) => (
            <div className="grid grid-2 wallet-grid">
              <div className="stack-lg">
                <Card
                  title={entry.name}
                  subtitle={entry.description}
                  headingLevel={2}
                >
                  <LedgerSummary entry={entry} token={token} />
                </Card>
                <Card title="Balance" headingLevel={2}>
                  {/* A server has no caller: the balance is browser-only. */}
                  <ClientOnly fallback={<Skeleton height="3rem" />}>
                    <BalancePanel key={entry.id} entry={entry} token={token} />
                  </ClientOnly>
                </Card>
              </div>
              <Card
                title={`Send ${token.symbol}`}
                subtitle="icrc1_transfer, typed: TypedForm<TransferArg>"
                headingLevel={2}
              >
                {/* Server-rendered too: disabled until a caller signs in. */}
                <SendPanel
                  key={entry.id}
                  entry={entry}
                  token={token}
                  onReadBack={readBack}
                />
              </Card>
            </div>
          )}
        </WithLedgerToken>
      </SectionBoundary>

      {ledger === "ckbtc" && <MinterPanel />}
    </div>
  )
}

function WalletSkeleton(): ReactElement {
  return (
    <div className="grid grid-2 wallet-grid" aria-busy="true">
      <span className="sr-only">Loading the ledger</span>
      <Skeleton height="14rem" />
      <Skeleton height="20rem" />
    </div>
  )
}
