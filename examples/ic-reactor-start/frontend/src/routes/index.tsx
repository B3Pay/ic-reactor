import { createFileRoute } from "@tanstack/react-router"
import { useAuth } from "../lib/client"
import { useBackendMutation, useBackendQuery } from "../canisters/backend"

export const Route = createFileRoute("/")({
  component: HomeRoute,
})

function HomeRoute() {
  const { data: greeting, isPending: greetingPending } = useBackendQuery({
    functionName: "greet",
    args: ["IC Reactor Start"],
  })
  const {
    data: count,
    isPending: countPending,
    refetch: refetchCount,
  } = useBackendQuery({
    functionName: "getCount",
  })
  const { mutate: increment, isPending: incrementing } = useBackendMutation({
    functionName: "increment",
    onSuccess: () => refetchCount(),
  })
  const { login, logout, principal, isAuthenticated, isAuthenticating, error } =
    useAuth()

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">CSR static app on ICP</p>
        <h1>@ic-reactor/start</h1>
        <p className="lede">
          TanStack Router, IC Reactor hooks, Internet Identity, and icp-cli
          canister resolution in one small Vite preset.
        </p>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>Backend query</h2>
          <p className="value">
            {greetingPending ? "Loading greeting..." : greeting}
          </p>
        </article>

        <article className="panel">
          <h2>Backend update</h2>
          <p className="value">
            Count: {countPending ? "..." : count?.toString()}
          </p>
          <button
            type="button"
            onClick={() => increment([])}
            disabled={incrementing}
          >
            {incrementing ? "Incrementing..." : "Increment"}
          </button>
        </article>

        <article className="panel">
          <h2>Internet Identity</h2>
          {isAuthenticated ? (
            <>
              <p className="principal">{principal?.toText()}</p>
              <button type="button" onClick={() => logout()}>
                Logout
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => login()}
              disabled={isAuthenticating}
            >
              {isAuthenticating ? "Opening..." : "Login"}
            </button>
          )}
          {error ? <p className="error">{error.message}</p> : null}
        </article>
      </section>
    </main>
  )
}
