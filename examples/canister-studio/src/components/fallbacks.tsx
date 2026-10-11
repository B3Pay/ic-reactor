import {
  Link,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router"
import type { ReactElement } from "react"

/**
 * The router's `defaultNotFoundComponent`: an unknown path, or a route that
 * threw `notFound()` without a `notFoundComponent` of its own.
 */
export function DefaultNotFound(): ReactElement {
  return (
    <section className="empty-state" aria-labelledby="not-found-title">
      <p className="empty-state-code mono">404</p>
      <h1 id="not-found-title">Page not found</h1>
      <p className="muted">Nothing lives at this address.</p>
      <Link to="/" className="btn btn-primary">
        Back to the studio
      </Link>
    </section>
  )
}

/**
 * The router's `defaultErrorComponent`. A loader or render error that the
 * route did not handle itself. Only the message is shown: an error that
 * crossed from the server is a plain `Error(message)` by then (the router's
 * serializer keeps nothing else), so its kind and code are not here.
 */
export function DefaultError({ error }: ErrorComponentProps): ReactElement {
  const router = useRouter()
  const message = error instanceof Error ? error.message : String(error)
  return (
    <section className="empty-state" role="alert">
      <h1>Something went wrong</h1>
      <pre className="code empty-state-detail">{message}</pre>
      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          // Reloads the route's loaders and resets this error boundary.
          onClick={() => void router.invalidate()}
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
