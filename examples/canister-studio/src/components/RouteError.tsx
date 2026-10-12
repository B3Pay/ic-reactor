import {
  Link,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router"
import type { ReactElement } from "react"

/**
 * A route's `errorComponent`: the message, and a retry that reloads the
 * route's loaders and resets the boundary. Only the message is shown: an
 * error that crossed from the server is a plain `Error(message)` by then
 * (the router's serializer keeps nothing else).
 */
export function RouteError({
  error,
  reset,
  title = "Something went wrong",
}: ErrorComponentProps & { title?: string }): ReactElement {
  const router = useRouter()
  const message = error instanceof Error ? error.message : String(error)
  return (
    <section className="empty-state" role="alert">
      <h1>{title}</h1>
      <pre className="code empty-state-detail">{message}</pre>
      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            void router.invalidate()
            reset()
          }}
        >
          Try again
        </button>
        <Link to="/" className="btn">
          Home
        </Link>
      </div>
    </section>
  )
}
