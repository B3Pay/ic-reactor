// Third-party modules the factory pages' router, form and error-boundary
// examples import, which no workspace package installs, so the shared
// `ambient.d.ts` has no stub for them. Only what the snippets use is declared.
// `globals.ts` pulls this file in.

/** The router context of the TanStack Router examples: `{ backend }`. */
interface FactoryDocsRouterContext {
  backend: typeof import("./reactor").backend
}

/** The `$param` segments of a TanStack Router path. */
type FactoryDocsPathParams<Path extends string> =
  Path extends `${string}$${infer Param}/${infer Rest}`
    ? { [K in Param | keyof FactoryDocsPathParams<Rest>]: string }
    : Path extends `${string}$${infer Param}`
      ? { [K in Param]: string }
      : {}

declare module "@tanstack/react-router" {
  import type { ComponentType, ReactNode } from "react"

  interface Route<Params> {
    useParams(): Params
    useNavigate(): (options: { to: string }) => Promise<void>
  }
  interface RouteOptions<Params> {
    loader?: (context: {
      params: Params
      context: FactoryDocsRouterContext
    }) => unknown
    component?: ComponentType
    pendingComponent?: ComponentType
  }

  export function createFileRoute<Path extends string>(
    path: Path
  ): (
    options: RouteOptions<FactoryDocsPathParams<Path>>
  ) => Route<FactoryDocsPathParams<Path>>
  export function createRootRouteWithContext<
    Context extends object,
  >(): (options: { component: ComponentType }) => unknown
  export function createRouter<Context extends object>(options: {
    routeTree: unknown
    context: Context
    defaultPreloadStaleTime?: number
  }): unknown
  export function redirect(options: { to: string }): Error
  export function useNavigate(): (options: { to: string }) => Promise<void>
  export function Link(props: {
    to: string
    className?: string
    onMouseEnter?: () => void
    children?: ReactNode
  }): ReactNode
}

declare module "@tanstack/react-virtual" {
  interface VirtualItem {
    key: string | number | bigint
    index: number
    start: number
    size: number
  }
  export function useVirtualizer(options: {
    count: number
    getScrollElement: () => Element | null
    estimateSize: (index: number) => number
    overscan?: number
  }): {
    getVirtualItems(): VirtualItem[]
    getTotalSize(): number
  }
}

declare module "react-router-dom" {
  import type { ReactNode } from "react"

  export interface LoaderFunctionArgs {
    params: Readonly<Partial<Record<string, string>>>
  }
  export function createBrowserRouter(
    routes: {
      path: string
      loader?: (args: LoaderFunctionArgs) => unknown
      Component?: () => ReactNode
    }[]
  ): unknown
  export function useLoaderData(): unknown
  export function useParams(): Readonly<Partial<Record<string, string>>>
}

declare module "react-hook-form" {
  export function useForm<Fields extends object>(): {
    register(
      name: keyof Fields & string,
      options?: { required?: boolean }
    ): { name: string }
    handleSubmit(
      onValid: (fields: Fields) => void
    ): (event?: { preventDefault(): void }) => void
    reset(): void
    formState: { errors: Partial<Record<keyof Fields, unknown>> }
  }
}

declare module "react-error-boundary" {
  import type { ReactNode } from "react"

  export function ErrorBoundary(props: {
    fallbackRender: (props: {
      error: Error
      resetErrorBoundary: () => void
    }) => ReactNode
    children?: ReactNode
  }): ReactNode
}
