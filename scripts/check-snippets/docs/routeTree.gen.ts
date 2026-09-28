// The `src/routeTree.gen.ts` the TanStack Router plugin writes for the routes
// the docs pages show. A real app's tsconfig includes it, and its
// `FileRoutesByPath` augmentation is what types `createFileRoute("/posts")`
// with the route's params and its router context, so the globals of the
// sections that have router examples import it for the same reason. Every
// route hangs off one root route whose context is the factory pages'
// `{ backend }`. A route a page shows must be listed here, as it would be
// once the plugin has seen its file.
import {
  createRootRouteWithContext,
  type AnyRoute,
} from "@tanstack/react-router"
import type { backend } from "./reference/factories/reactor"

/** The router context of the factory pages' examples. */
interface RouterContext {
  backend: typeof backend
}

const rootRoute = createRootRouteWithContext<RouterContext>()()

/** What the plugin exports as `routeTree`: the root route and its children. */
export const routeTree = rootRoute

/** What the plugin writes for a top-level route file at `Path`. */
interface GeneratedRoute<Path extends string> {
  id: Path
  path: Path
  fullPath: Path
  preLoaderRoute: AnyRoute
  parentRoute: typeof rootRoute
}

declare module "@tanstack/react-router" {
  interface FileRoutesByPath {
    "/posts": GeneratedRoute<"/posts">
    "/posts/new": GeneratedRoute<"/posts/new">
    "/users/$userId": GeneratedRoute<"/users/$userId">
    "/wallet/$canisterId": GeneratedRoute<"/wallet/$canisterId">
  }
}
