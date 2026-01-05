/**
 * createActorSuspenseQuery, createActorSuspenseQueryFactory & createActorMutation Demo
 *
 * This demo showcases the main patterns for creating reusable
 * query and mutation wrappers in IC Reactor:
 *
 * 1. `createActorSuspenseQuery` - For static queries where args are known upfront
 * 2. `createActorSuspenseQueryFactory` - For dynamic queries where args are provided at call time
 * 3. `createActorMutation` - For mutations like transfers
 */
import { Suspense } from "react"
import { styles } from "./styles"
import {
  icpNameQuery,
  icpSymbolQuery,
  icpTotalSupplyQuery,
  icpFeeQuery,
  useAuth,
} from "./reactor"
import {
  AuthSection,
  BalanceLookup,
  Card,
  CodeExample,
  TransferSection,
} from "./components"

// ============================================================================
// Main App
// ============================================================================

export default function App() {
  const { principal, isAuthenticated, login, isAuthenticating } = useAuth()
  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.topRight}>
          <AuthSection />
        </div>
        <h1 style={styles.title}>🔮 IC Reactor Demo</h1>
        <p style={styles.subtitle}>
          Demonstrating{" "}
          <code style={styles.code}>createActorSuspenseQuery</code>,{" "}
          <code style={styles.code}>createActorSuspenseQueryFactory</code>, and{" "}
          <code style={styles.code}>createActorMutation</code>
        </p>
      </header>

      <main style={styles.main}>
        {/* Core Setup Overview */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>🛠️ Reactor Setup</h2>
          <p style={styles.description}>
            The following core definitions are used throughout this demo to
            provide consistent type transformations and formatting.
          </p>
          <CodeExample
            title="reactor.ts (Shared Logic)"
            code={`// 1. Setup DisplayReactor for automatic transformations
export const icpReactor = new DisplayReactor<Ledger>({
  clientManager,
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
  idlFactory: ledgerIdlFactory,
})

// 2. Create a shared query factory for balances
// This is used in multiple sections below!
export const getIcpBalance = createSuspenseQueryFactory(icpReactor, {
  functionName: "icrc1_balance_of",
  refetchInterval: 5 * 1000, // 5 seconds
  select: (balance) => formatBalance(balance, "ICP"),
})`}
          />
        </section>
        {/* Section 1: createActorSuspenseQuery - Static Queries */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>
            📊 createActorSuspenseQuery - Static Queries
          </h2>
          <p style={styles.description}>
            Use <code style={styles.code}>createActorSuspenseQuery</code> for
            methods that don't require arguments (like metadata) or when
            arguments are fixed. It returns a ready-to-use hook.
          </p>

          <div style={styles.cardGrid}>
            <Suspense fallback={<Card title="Token Name" loading />}>
              <TokenNameCard />
            </Suspense>
            <Suspense fallback={<Card title="Symbol" loading />}>
              <TokenSymbolCard />
            </Suspense>
            <Suspense fallback={<Card title="Total Supply" loading />}>
              <TotalSupplyCard />
            </Suspense>
            <Suspense fallback={<Card title="Transfer Fee" loading />}>
              <TransferFeeCard />
            </Suspense>
          </div>

          <CodeExample
            title="How it works:"
            code={`// Define query with no arguments (or fixed args)
const icpNameQuery = createActorSuspenseQuery(icpReactor, {
  functionName: "icrc1_name",
})

// Use in component (data is always defined!)
const { data } = icpNameQuery.useSuspenseQuery()`}
          />
        </section>

        {/* Section 2: createActorSuspenseQueryFactory - Dynamic Queries */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>
            ⚡ createActorSuspenseQueryFactory - Dynamic Queries
          </h2>
          <p style={styles.description}>
            Use <code style={styles.code}>createActorSuspenseQueryFactory</code>{" "}
            when you need to pass arguments at runtime.
          </p>

          <BalanceLookup />

          <CodeExample
            title="How it works:"
            code={`// Define factory with select transformation
const getIcpBalance = createActorSuspenseQueryFactory(icpReactor, {
  functionName: "icrc1_balance_of",
  select: (balance) => formatBalance(balance, "ICP"),
})

// In component: call factory with args, then use the hook
function BalanceDisplay({ account }) {
  const balanceQuery = getIcpBalance(account)
  const { data } = balanceQuery.useQuery()
  return <span>{data}</span> // "1.23M ICP"
}

// In loader: call factory with args, then fetch
async function loader({ params }) {
  const balance = await getIcpBalance(params.account).fetch()
  return { balance }
}`}
          />
        </section>

        {/* Section 3: Select Transformations */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>🔄 Select Transformations</h2>
          <p style={styles.description}>
            Transform query results using the{" "}
            <code style={styles.code}>select</code> option.
          </p>

          <CodeExample
            title="Chaining selects:"
            code={`// Transform at creation time
const formattedBalance = createActorSuspenseQueryFactory(manager, {
  functionName: "icrc1_balance_of",
  select: (balance) => \`\${balance} ICP\`,
})

// Chain another select in the hook
const { data } = formattedBalance(account).useQuery({
  select: (formatted) => formatted.toUpperCase(),
})`}
          />
        </section>

        {/* Section 4: createActorMutation - Simple Wallet */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>
            💸 createActorMutation - Simple Wallet
          </h2>
          <p style={styles.description}>
            Use <code style={styles.code}>createActorMutation</code> for
            mutations like transfers.{" "}
            <strong style={{ color: "#4ade80" }}>
              🔥 Balance auto-refetches after transfer!
            </strong>
          </p>

          {isAuthenticated ? (
            <TransferSection principal={principal!} />
          ) : (
            <div style={styles.transferContainer}>
              <div style={styles.loginPrompt}>
                <p style={styles.loginText}>
                  🔐 Login with Internet Identity to enable transfers
                </p>
                <button
                  onClick={() => login()}
                  disabled={isAuthenticating}
                  style={styles.loginButton}
                >
                  {isAuthenticating
                    ? "Connecting..."
                    : "Login with Internet Identity"}
                </button>
              </div>
            </div>
          )}

          <CodeExample
            title="How it works (with auto-refetch):"
            code={`// Define mutation
const icpTransferMutation = createActorMutation(icpReactor, {
  functionName: "icrc1_transfer",
})

// 1. Parent protects the component and passes principal
{isAuthenticated ? (
  <TransferSection principal={principal!} />
) : (
  <LoginPrompt />
)}

// 2. TransferSection accepts principal as a prop
function TransferSection({ principal }: { principal: Principal }) {
  // Get balance query (for automatic refetching)
  const account = useMemo(
    () => ({ owner: principal.toText(), subaccount: null }),
    [principal]
  )
  const balanceQuery = getIcpBalance([account])

  // 🔥 Auto-refetch balance after successful transfer!
  const { mutate } = icpTransferMutation.useMutation({
    invalidateQueries: [balanceQuery.getQueryKey()], 
  })

  // DisplayReactor accepts strings for amounts!
  const handleTransfer = () => {
    mutate([{
      to: { owner: recipient, subaccount: null },
      amount: "10000", // 0.0001 ICP (8 decimals)
      ...
    }])
  }
}

// 3. UserBalance uses suspense query for clean data
function UserBalance({ principal }) {
  const account = { owner: principal, subaccount: null }
  const { data: balance } = getIcpBalance([account]).useSuspenseQuery()

  return <span>Balance: {balance}</span>
}`}
          />
        </section>
      </main>
    </div>
  )
}

// ============================================================================
// Static Query Components (using createActorSuspenseQuery)
// ============================================================================

function TokenNameCard() {
  const { data } = icpNameQuery.useSuspenseQuery()
  return <Card title="Token Name" value={data} />
}

function TokenSymbolCard() {
  const { data } = icpSymbolQuery.useSuspenseQuery()
  return <Card title="Symbol" value={data} />
}

function TotalSupplyCard() {
  const { data } = icpTotalSupplyQuery.useSuspenseQuery()
  return <Card title="Total Supply" value={data} />
}

function TransferFeeCard() {
  const { data } = icpFeeQuery.useSuspenseQuery()
  return <Card title="Transfer Fee" value={data} />
}
