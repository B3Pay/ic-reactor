/**
 * IC-Reactor Demo App - ZERO CONFIG EDITION!
 *
 * This demonstrates the power of the @ic-reactor/vite-plugin:
 *
 * 🎯 The plugin generates ONLY the reactor and canister-specific hooks
 * ✅ You control the ClientManager and QueryClient
 *
 * Project structure:
 * - src/lib/client.ts        → Your ClientManager & auth hooks (you own this)
 * - src/canisters/backend/   → Auto-generated reactor & hooks (don't edit)
 */

import { Suspense, useState } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"

// ═══════════════════════════════════════════════════════════════════════════
// USER-OWNED: ClientManager, QueryClient, Auth Hooks
// ═══════════════════════════════════════════════════════════════════════════
import { queryClient, useAuth, useAgentState } from "./lib/client"

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-GENERATED: Canister-specific hooks
// ═══════════════════════════════════════════════════════════════════════════
import {
  useBackendQuery,
  useBackendMutation,
  useBackendSuspenseQuery,
} from "./generated/backend"

import "./App.css"

// ═══════════════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════════════

export default function App() {
  const { isInitialized, error } = useAgentState()

  if (error) {
    return (
      <div className="error-container">
        <h1>❌ Failed to initialize agent</h1>
        <pre>{error.message}</pre>
      </div>
    )
  }

  if (!isInitialized) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <p>Initializing IC Agent...</p>
      </div>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <MainApp />
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
    </QueryClientProvider>
  )
}

function MainApp() {
  return (
    <div className="app">
      <Header />
      <main className="main">
        <ZeroConfigBanner />
        <AuthSection />
        <GreetSection />
        <MessageSection />
        <CounterSection />
        <SuspenseCounterSection />
      </main>
      <Footer />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ZERO CONFIG BANNER
// ═══════════════════════════════════════════════════════════════════════════

function ZeroConfigBanner() {
  return (
    <section className="section banner">
      <h2>🚀 Clean Separation of Concerns</h2>
      <div className="banner-content">
        <div className="banner-item">
          <span className="banner-icon">👤</span>
          <span className="banner-text">
            You own <code>lib/client.ts</code>
          </span>
        </div>
        <div className="banner-arrow">+</div>
        <div className="banner-item">
          <span className="banner-icon">⚡</span>
          <span className="banner-text">
            Plugin generates <code>canisters/*</code>
          </span>
        </div>
      </div>
      <pre className="code-preview">
        {`// src/lib/client.ts (YOU OWN THIS)
export const clientManager = new ClientManager({ ... })
export const authentication = new AuthenticationManager({ clientManager })
export const { useAuth } = createAuthHooks(authentication)

// src/canisters/backend/index.ts (AUTO-GENERATED)
import { clientManager } from "../../lib/client"
export const { useBackendQuery, useBackendMutation } = ...`}
      </pre>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// HEADER
// ═══════════════════════════════════════════════════════════════════════════

function Header() {
  return (
    <header className="header">
      <div className="logo">
        <span className="logo-icon">⚛️</span>
        <h1>IC-Reactor Vite Plugin</h1>
      </div>
      <p className="subtitle">
        Auto-generated React hooks from Candid • You control the ClientManager
      </p>
    </header>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH SECTION
// ═══════════════════════════════════════════════════════════════════════════

function AuthSection() {
  const { login, logout, isAuthenticated, principal, isAuthenticating } =
    useAuth()

  return (
    <section className="section">
      <h2>🔐 Authentication</h2>
      <div className="auth-content">
        {isAuthenticated ? (
          <>
            <div className="principal-display">
              <span className="label">Principal:</span>
              <code>{principal?.toText()}</code>
            </div>
            <button onClick={() => logout()} className="btn btn-secondary">
              Logout
            </button>
          </>
        ) : (
          <button
            onClick={() => login()}
            disabled={isAuthenticating}
            className="btn btn-primary"
          >
            {isAuthenticating
              ? "Connecting..."
              : "Login with Internet Identity"}
          </button>
        )}
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// GREET SECTION
// ═══════════════════════════════════════════════════════════════════════════

function GreetSection() {
  const [name, setName] = useState("World")

  // 🎯 Auto-generated hook! Just pass function name and args.
  const {
    data: greeting,
    isLoading,
    refetch,
  } = useBackendQuery({
    functionName: "greet",
    args: [name],
  })

  return (
    <section className="section">
      <h2>👋 Greet Query</h2>
      <div className="greet-content">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          className="input"
        />
        <button onClick={() => refetch()} className="btn btn-primary">
          Greet
        </button>
      </div>
      <div className="result">
        {isLoading ? (
          <span className="loading-text">Loading...</span>
        ) : (
          <span className="greeting">{greeting}</span>
        )}
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE SECTION
// ═══════════════════════════════════════════════════════════════════════════

function MessageSection() {
  const [newMessage, setNewMessage] = useState("")

  // 🎯 Auto-generated hooks!
  const {
    data: message,
    isLoading,
    refetch,
  } = useBackendQuery({
    functionName: "get_message",
  })

  const { mutate: setMessage, isPending } = useBackendMutation({
    functionName: "set_message",
    onSuccess: () => refetch(), // Manually refetch after mutation
  })

  const handleSetMessage = () => {
    if (newMessage.trim()) {
      setMessage([newMessage])
      setNewMessage("")
    }
  }

  return (
    <section className="section">
      <h2>💬 Message State</h2>
      <div className="message-display">
        <span className="label">Current message:</span>
        {isLoading ? (
          <span className="loading-text">Loading...</span>
        ) : (
          <span className="message">{message ?? <em>No message set</em>}</span>
        )}
      </div>
      <div className="message-input">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Enter a new message"
          className="input"
          onKeyDown={(e) => e.key === "Enter" && handleSetMessage()}
        />
        <button
          onClick={handleSetMessage}
          disabled={isPending || !newMessage.trim()}
          className="btn btn-primary"
        >
          {isPending ? "Saving..." : "Set Message"}
        </button>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// COUNTER SECTION
// ═══════════════════════════════════════════════════════════════════════════

function CounterSection() {
  // 🎯 Auto-generated hooks!
  const {
    data: counter,
    isLoading,
    isFetching,
    refetch,
  } = useBackendQuery({
    functionName: "get_counter",
    refetchInterval: 3000, // Explicitly set refetch interval
  })

  const { mutate: increment, isPending } = useBackendMutation({
    functionName: "increment",
    onSuccess: () => refetch(),
  })

  return (
    <section className="section">
      <h2>🔢 Counter (Polling Query)</h2>
      <div className="counter-display">
        <span className="counter-value">{isLoading ? "..." : counter}</span>
        {isFetching && !isLoading && (
          <span className="fetching-indicator" title="Refetching..." />
        )}
      </div>
      <button
        onClick={() => increment([])}
        disabled={isPending}
        className="btn btn-primary"
      >
        {isPending ? "Incrementing..." : "Increment"}
      </button>
      <p className="section-note">
        Auto-refreshes every 3 seconds using refetchInterval
      </p>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SUSPENSE COUNTER SECTION
// ═══════════════════════════════════════════════════════════════════════════

function SuspenseCounterSection() {
  return (
    <section className="section">
      <h2>⏳ Counter (React Suspense)</h2>
      <Suspense fallback={<CounterSkeleton />}>
        <SuspenseCounter />
      </Suspense>
      <p className="section-note">
        Uses React Suspense for declarative loading states
      </p>
    </section>
  )
}

function SuspenseCounter() {
  // 🎯 Auto-generated suspense hook!
  const { data: counter } = useBackendSuspenseQuery({
    functionName: "get_counter",
  })
  return <div className="counter-display">{counter}</div>
}

function CounterSkeleton() {
  return (
    <div className="counter-display skeleton">
      <div className="skeleton-pulse" />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// FOOTER
// ═══════════════════════════════════════════════════════════════════════════

function Footer() {
  return (
    <footer className="footer">
      <p>
        <strong>@ic-reactor/vite-plugin</strong> • You own the ClientManager
      </p>
      <p className="footer-note">
        Edit <code>backend.did</code> → Hooks regenerate → Import & use!
      </p>
    </footer>
  )
}
