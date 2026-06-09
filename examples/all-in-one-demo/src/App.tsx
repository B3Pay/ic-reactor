import { useEffect, useState } from "react"
import { getLikes, getLogs, getPosts } from "./lib/factories"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { QueryClientProvider, useIsFetching } from "@tanstack/react-query"
import { useLogs } from "./lib/useLogs"
import { GlobalHeart } from "./components/GlobalHeart"
import { LogConsole, BackendLogConsole } from "./components/LogConsole"
import { PostSection } from "./components/PostSection"
import { AgentStatus } from "./components/AgentStatus"
import { AnalyticsSection } from "./components/AnalyticsSection"
import { SuspenseSection } from "./components/SuspenseSection"
import { FooterSection } from "./components/FooterSection"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Code, ChevronDown, ChevronUp } from "lucide-react"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism"
import { clientManager, queryClient } from "./lib/client"
import { useAgentState } from "./lib/authHooks"

/**
 * Root Application Component.
 * Sets up the QueryClientProvider and initializes the IC client.
 */
export default function App() {
  const { isInitialized } = useAgentState()
  console.log("isInitialized", isInitialized)

  useEffect(() => {
    clientManager.initialize()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      {isInitialized ? <MainLayout /> : <div>Loading...</div>}
      <ReactQueryDevtools
        initialIsOpen={false}
        position="left"
        buttonPosition="bottom-left"
      />
    </QueryClientProvider>
  )
}

/**
 * Status indicator that shows when fetching is in progress
 */
function FetchingIndicator({
  isFetching,
  size = "sm",
}: {
  isFetching: boolean
  size?: "sm" | "md"
}) {
  const sizeClasses = size === "sm" ? "w-2 h-2" : "w-2.5 h-2.5"

  return (
    <div
      className={`${sizeClasses} rounded-full transition-all duration-300 shrink-0 ${
        isFetching
          ? "bg-success shadow-[0_0_8px_oklch(0.72_0.19_150)]"
          : "bg-muted-foreground/30"
      }`}
    >
      {isFetching && (
        <div className="w-full h-full rounded-full bg-success animate-ping opacity-75" />
      )}
    </div>
  )
}

/**
 * Component to display a code snippet that can be toggled
 */
function CodeSnippet({ code }: { code: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="mt-4 border border-border/40 rounded-lg overflow-hidden bg-slate-950/20 backdrop-blur-sm">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center px-4 py-2 h-9 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-white/5"
      >
        <div className="flex items-center gap-2">
          <Code className="w-3.5 h-3.5" />
          <span>{isOpen ? "Hide Example Code" : "View Example Code"}</span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-3.5 h-3.5 opacity-50" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 opacity-50" />
        )}
      </Button>

      {isOpen && (
        <div className="bg-slate-950 border-t border-border/20 max-h-125 overflow-y-auto">
          <SyntaxHighlighter
            language="typescript"
            style={oneDark}
            customStyle={{
              margin: 0,
              padding: "1.5rem",
              fontSize: "0.8rem",
              backgroundColor: "transparent",
            }}
            codeTagProps={{
              style: {
                fontFamily:
                  'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              },
            }}
          >
            {code}
          </SyntaxHighlighter>
        </div>
      )}
    </div>
  )
}

/**
 * Section wrapper with title and optional fetching indicator
 */
function Section({
  title,
  description,
  children,
  isFetching,
  code,
}: {
  title: string
  description: string
  children: React.ReactNode
  isFetching?: boolean
  code?: string
}) {
  return (
    <section className="mb-12">
      <header className="mb-5">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold tracking-tight">{title}</h2>
            {isFetching !== undefined && (
              <FetchingIndicator isFetching={isFetching} />
            )}
          </div>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-2xl">
          {description}
        </p>
      </header>
      {children}
      {code && <CodeSnippet code={code} />}
    </section>
  )
}

/**
 * Main Layout Component.
 */
function MainLayout() {
  const { frontendLogs, addLog } = useLogs()
  const isGlobalFetching = useIsFetching()
  const isHeartFetching = useIsFetching({ queryKey: getLikes.getQueryKey() })
  const isPostsFetching = useIsFetching({ queryKey: getPosts.getQueryKey() })
  const isLogsFetching = useIsFetching({ queryKey: getLogs.getQueryKey() })

  return (
    <div className="min-h-screen bg-background font-sans py-12 px-5 md:px-8 lg:py-16">
      <div className="max-w-6xl mx-auto">
        <Header />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-10 lg:gap-14 items-start">
          <main>
            <Section
              title="State Management & Auth"
              description="Built-in hooks for easy access to Actor State, Internet Identity Authentication, and Network Status."
              code={`// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔐 INTERNET IDENTITY INTEGRATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ic-reactor handles the entire II flow — no manual agent setup!

// reactor.ts — One-time setup
export const clientManager = new ClientManager({
  queryClient,
});

export const authentication = new AuthenticationManager({ clientManager });
export const { useAuth, useAgentState } = createAuthHooks(authentication);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component usage — feels like magic ✨
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const { login, logout, principal, isAuthenticated } = useAuth();

// Login triggers II popup, updates agent identity globally,
// and automatically refreshes ALL queries with the new identity!
login({
  onSuccess: () => {
    console.log("Welcome:", principal.toText());
    // 🎯 All queries now use authenticated agent!
  }
});

// Agent health monitoring
const { isInitialized, error } = useAgentState();
// → Reactive! UI updates when agent state changes`}
            >
              <AgentStatus addLog={addLog} />
            </Section>

            <Section
              title="Suspense Query Demo"
              description="Leveraging React Suspense for declarative data fetching. The UI 'suspends' showing a fallback until all required data is ready."
              code={`// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎯 TYPE-SAFE CANDID INTEGRATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Candid: get_posts_count : () -> (nat) query

export const getPostsCountSuspense = createSuspenseQuery(reactor, {
  functionName: "get_posts_count",  // ← TypeScript autocompletes!
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🪄 DISPLAYREACTOR: nat → string
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Raw Candid returns bigint (e.g., 42n)
// DisplayReactor converts to string (e.g., "42")

function TotalPosts() {
  // data is string! No .toString() needed.
  const { data: count } = getPostsCountSuspense.useSuspenseQuery();
  return <span>{count}</span>;
}

// Wrap with Suspense — React handles loading states
<Suspense fallback={<Skeleton />}>
  <TotalPosts />  {/* No isLoading check needed! */}
</Suspense>`}
            >
              <SuspenseSection />
            </Section>

            <Section
              title="Real-Time Canister Analytics"
              description="Live aggregation of backend event logs. Demonstrates efficient query polling and client-side data processing of Candid records."
              isFetching={isLogsFetching > 0}
              code={`// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⚡ REAL-TIME DATA WITH AUTO-POLLING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Candid: get_logs : () -> (vec Log) query
// Log = record { timestamp: int; caller: principal; action: text; details: text }

export const getLogs = createQuery(reactor, {
  functionName: "get_logs",
  refetchInterval: 1000,  // 🔄 Polls canister every second!
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// � DISPLAYREACTOR AUTO-TRANSFORMS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Candid types become strings:
//   log.caller    : principal → string
//   log.timestamp : int → string

const { data: logs = [] } = getLogs.useQuery();

// 🧠 SMART CACHING: Multiple components share one request!
const { data: recent } = getLogs.useQuery({
  select: (data) => data.slice(-10),  // Last 10 only
});

// Query Key API for advanced control
const queryKey = getLogs.getQueryKey();`}
            >
              <AnalyticsSection />
            </Section>

            <Section
              title="Optimistic Global Heart"
              description="Click the heart to trigger an optimistic update. The UI reflects the change immediately, even before the backend confirms. Chaos Mode simulates failures to demonstrate automatic rollback."
              isFetching={isHeartFetching > 0}
              code={`// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⚡ OPTIMISTIC UI WITH AUTOMATIC ROLLBACK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Candid: like : () -> (variant { Ok; Err : text })
export const likeHeart = createMutation(reactor, {
  functionName: "like",
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🪄 DEDICATED ERROR HANDLERS (Unique to ic-reactor!)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ic-reactor v3 provides THREE callback types:

const { mutateAsync } = likeHeart.useMutation({
  onSuccess: () => {
    // ✅ Called when canister returns { Ok }
    console.log("Like confirmed!");
  },
  
  onCanisterError: (err) => {
    // 🎯 NEW! Called ONLY for canister { Err } results
    // err.err = typed error value from Candid
    // err.code = variant key (e.g., "InsufficientBalance")
    console.error("Canister rejected:", err.code, err.err);
  },
  
  onError: (err) => {
    // ⚠️ Called for ALL errors (network + canister)
    // Useful for generic error logging
    console.error("Mutation failed:", err);
  },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔄 OPTIMISTIC STATE WITH REACT 19
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const [optimisticLikes, addOptimistic] = useOptimistic(serverLikes);

startTransition(async () => {
  addOptimistic({ type: "add", principal });  // 1. UI instant
  await mutateAsync([]);                      // 2. Network
  // 3. Rollback on { Err }, confirm on { Ok }
});

// 💡 The IC's 2-second update latency becomes invisible!`}
            >
              <GlobalHeart addLog={addLog} />
            </Section>

            <Section
              title="Live Posts Feed"
              description="Infinite scrolling with optimistic updates. Posts appear instantly and scrolling hits the backend for paginated data using efficient Motoko slicing."
              isFetching={isPostsFetching > 0}
              code={`// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📜 INFINITE QUERIES WITH CANDID PAGINATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Candid: get_posts : (nat, nat) -> (vec Post) query
// Post = record { id: nat; content: text; caller: principal; timestamp: int }

export const getPosts = createInfiniteQuery(reactor, {
  functionName: "get_posts",
  initialPageParam: 0n,
  
  // DisplayReactor: args are strings, auto-converted to nat
  getArgs: (offset) => [offset.toString(), "5"] as const,
  
  // Calculate next page from response
  getNextPageParam: (lastPage, allPages) => 
    lastPage.length < 5 ? null : BigInt(allPages.length) * 5n,
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🪄 DISPLAYREACTOR AUTO-TRANSFORMS RESPONSE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Candid types become display-friendly:
//   post.id        : nat → string
//   post.caller    : principal → string  
//   post.timestamp : int → string

const { data, fetchNextPage, hasNextPage } = getPosts.useInfiniteQuery({
  select: (data) => data.pages.flat(),
});

// Posts are ready for React - no .toString() needed!
data?.map(post => (
  <div key={post.id}>
    <p>{post.content}</p>
    <span>{post.caller}</span>
    <time>{new Date(Number(post.timestamp) / 1e6).toLocaleString()}</time>
  </div>
));`}
            >
              <PostSection addLog={addLog} />
            </Section>

            <FooterSection />
          </main>

          <aside className="flex flex-col gap-6 lg:sticky lg:top-6 h-fit">
            <div className="mb-1">
              <div className="flex items-center gap-2.5 mb-1.5">
                <h3 className="text-base font-semibold">Activity Logs</h3>
                <FetchingIndicator
                  isFetching={isGlobalFetching > 0}
                  size="md"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Real-time tracking of frontend optimistic states and backend
                outcomes.
              </p>
            </div>
            <LogConsole title="Frontend" logs={frontendLogs} isFrontend />
            <BackendLogConsole />
          </aside>
        </div>
      </div>
    </div>
  )
}

/**
 * Header Component with gradient title
 */
function Header() {
  return (
    <header className="text-center mb-14 lg:mb-16">
      <div className="flex justify-center mb-4">
        <Badge
          variant="outline"
          className="text-xs font-medium px-3 py-1 border-primary/30 text-primary"
        >
          IC-Reactor v3
        </Badge>
      </div>
      <h1 className="text-4xl md:text-5xl font-black tracking-tight text-gradient mb-5">
        IC-Reactor Demo
      </h1>
      <p className="text-muted-foreground text-lg max-w-xl mx-auto leading-relaxed">
        Showcasing advanced patterns for the Internet Computer: Optimistic UI,
        Infinite Querying, and Interactive Chaos Testing.
      </p>
    </header>
  )
}
