/**
 * IC-Reactor Demo App
 *
 * Demonstrates the integration of ic-reactor with the new ICP SDK ecosystem:
 * - Runtime canister ID resolution via ic_env cookie
 * - Auto-generated bindings from @icp-sdk/bindgen
 * - Type-safe React hooks from ic-reactor
 */

import { Suspense, useEffect, useState } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import {
  queryClient,
  clientManager,
  useAuth,
  useAgentState,
  greetQuery,
  getMessageQuery,
  getCounterQuery,
  setMessageMutation,
  incrementMutation,
  getCounterSuspense,
} from "./lib/reactor"
import "./App.css"

export default function App() {
  const { isInitialized, error } = useAgentState()

  useEffect(() => {
    clientManager.initialize()
  }, [])

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
// HEADER
// ═══════════════════════════════════════════════════════════════════════════

function Header() {
  return (
    <header className="header">
      <div className="logo">
        <span className="logo-icon">⚛️</span>
        <h1>IC-Reactor + ICP-CLI</h1>
      </div>
      <p className="subtitle">
        Zero-config canister integration with runtime environment resolution
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
  const { data: greeting, isLoading, refetch } = greetQuery([name]).useQuery()

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
  const { data: message, isLoading } = getMessageQuery.useQuery()
  const { mutate: setMessage, isPending } = setMessageMutation.useMutation()

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
          <span className="message">
            {message?.[0] ?? <em>No message set</em>}
          </span>
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
// COUNTER SECTION (Regular Query)
// ═══════════════════════════════════════════════════════════════════════════

function CounterSection() {
  const { data: counter, isLoading, isFetching } = getCounterQuery.useQuery()
  const { mutate: increment, isPending } = incrementMutation.useMutation()

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
  const { data: counter } = getCounterSuspense.useSuspenseQuery()
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
        <strong>IC-Reactor v3</strong> + <strong>ICP-CLI</strong> +{" "}
        <strong>@icp-sdk/bindgen</strong>
      </p>
      <p className="footer-note">
        Built for the DFINITY DX Team Demo • Runtime canister ID via ic_env
        cookie
      </p>
    </footer>
  )
}
