// Third-party modules snippets import that the checker has no installed package
// for. Each is declared here once, shaped after the package's public types at
// its current major, and only as far as the snippets reach. A snippet is
// checked against these types, so a declaration is never widened or bent to
// make one pass: fix the snippet, as a reader pasting it would have to.
//
// A module an example app installs is not declared here: the checker links
// those apps' dependencies for the docs pages (DEPENDENCY_SOURCES in
// check-snippets.mjs), so a snippet meets the real package: `@tanstack/react-router`,
// `@tanstack/react-form`, `react-hook-form`, `next` and the like. The one
// exception is `@vitejs/plugin-react`. The READMEs, which CI checks without
// installing any example, import it too.
//
// An ambient module declaration wins over the installed package of the same
// name, and this file is a `.d.ts`, which `skipLibCheck` does not check. A
// reference that resolves nowhere here is silently `any`: when editing, copy
// the file to a `.ts` and compile it to see the errors.

declare module "@vitejs/plugin-react" {
  import type { PluginOption } from "vite"
  export default function react(options?: object): PluginOption[]
}

/** react-router-dom v7 (a re-export of `react-router`). */
declare module "react-router-dom" {
  import type * as React from "react"

  export interface Path {
    pathname: string
    search: string
    hash: string
  }
  export type To = string | Partial<Path>
  export interface Location<State = any> extends Path {
    state: State
    key: string
  }
  export type Params<Key extends string = string> = {
    readonly [key in Key]: string | undefined
  }
  export type RelativeRoutingType = "route" | "path"

  export interface NavigateProps {
    to: To
    replace?: boolean
    state?: any
    relative?: RelativeRoutingType
  }
  export function Navigate(props: NavigateProps): null

  export interface LinkProps extends Omit<
    React.AnchorHTMLAttributes<HTMLAnchorElement>,
    "href"
  > {
    to: To
    replace?: boolean
    state?: any
    relative?: RelativeRoutingType
    reloadDocument?: boolean
  }
  export const Link: React.ForwardRefExoticComponent<
    LinkProps & React.RefAttributes<HTMLAnchorElement>
  >

  export function useLocation(): Location
  export function useParams<
    ParamsOrKey extends string | Record<string, string | undefined> = string,
  >(): Readonly<
    [ParamsOrKey] extends [string] ? Params<ParamsOrKey> : Partial<ParamsOrKey>
  >
  export function useLoaderData(): unknown

  export interface LoaderFunctionArgs<Context = any> {
    request: Request
    params: Params
    context?: Context
  }
  type DataFunctionValue = Response | NonNullable<unknown> | null
  export type LoaderFunction<Context = any> = (
    args: LoaderFunctionArgs<Context>
  ) => DataFunctionValue | Promise<DataFunctionValue>

  export interface IndexRouteObject {
    path?: string
    id?: string
    index: true
    children?: undefined
    loader?: LoaderFunction | boolean
    element?: React.ReactNode | null
    errorElement?: React.ReactNode | null
    Component?: React.ComponentType | null
    ErrorBoundary?: React.ComponentType | null
  }
  export interface NonIndexRouteObject {
    path?: string
    id?: string
    index?: false
    children?: RouteObject[]
    loader?: LoaderFunction | boolean
    element?: React.ReactNode | null
    errorElement?: React.ReactNode | null
    Component?: React.ComponentType | null
    ErrorBoundary?: React.ComponentType | null
  }
  export type RouteObject = IndexRouteObject | NonIndexRouteObject

  export interface PathRouteProps {
    path?: string
    id?: string
    index?: false
    children?: React.ReactNode
    loader?: LoaderFunction | boolean
    element?: React.ReactNode | null
    errorElement?: React.ReactNode | null
    Component?: React.ComponentType | null
    ErrorBoundary?: React.ComponentType | null
  }
  export interface LayoutRouteProps extends PathRouteProps {}
  export interface IndexRouteProps {
    path?: string
    id?: string
    index: true
    children?: undefined
    loader?: LoaderFunction | boolean
    element?: React.ReactNode | null
    errorElement?: React.ReactNode | null
    Component?: React.ComponentType | null
    ErrorBoundary?: React.ComponentType | null
  }
  export type RouteProps = PathRouteProps | LayoutRouteProps | IndexRouteProps
  export function Route(props: RouteProps): React.ReactElement | null

  /** The router `createBrowserRouter` returns, which `RouterProvider` takes. */
  export interface DataRouter {
    readonly routes: RouteObject[]
    navigate(to: To | number): Promise<void>
  }
  export function createBrowserRouter(
    routes: RouteObject[],
    opts?: { basename?: string }
  ): DataRouter
}

/** react-error-boundary v6. */
declare module "react-error-boundary" {
  import type {
    Component,
    ComponentType,
    ErrorInfo,
    PropsWithChildren,
    ReactNode,
  } from "react"

  export type FallbackProps = {
    error: unknown
    resetErrorBoundary: (...args: any[]) => void
  }

  type ErrorBoundaryResetDetails =
    | { reason: "imperative-api"; args: any[] }
    | {
        reason: "keys"
        prev: any[] | undefined
        next: any[] | undefined
      }

  type ErrorBoundaryPropsWithComponent = {
    onError?: (error: unknown, info: ErrorInfo) => void
    onReset?: (details: ErrorBoundaryResetDetails) => void
    resetKeys?: any[]
    fallback?: never
    FallbackComponent: ComponentType<FallbackProps>
    fallbackRender?: never
  }
  type ErrorBoundaryPropsWithRender = {
    onError?: (error: unknown, info: ErrorInfo) => void
    onReset?: (details: ErrorBoundaryResetDetails) => void
    resetKeys?: any[]
    fallback?: never
    FallbackComponent?: never
    fallbackRender: (props: FallbackProps) => ReactNode
  }
  type ErrorBoundaryPropsWithFallback = {
    onError?: (error: unknown, info: ErrorInfo) => void
    onReset?: (details: ErrorBoundaryResetDetails) => void
    resetKeys?: any[]
    fallback: ReactNode
    FallbackComponent?: never
    fallbackRender?: never
  }
  export type ErrorBoundaryProps =
    | ErrorBoundaryPropsWithFallback
    | ErrorBoundaryPropsWithComponent
    | ErrorBoundaryPropsWithRender

  type ErrorBoundaryState =
    { didCatch: true; error: unknown } | { didCatch: false; error: null }

  export class ErrorBoundary extends Component<
    PropsWithChildren<ErrorBoundaryProps>,
    ErrorBoundaryState
  > {}

  export type UseErrorBoundaryApi<TError> = {
    resetBoundary: () => void
    showBoundary: (error: TError) => void
  }
  export function useErrorBoundary<TError = any>(): UseErrorBoundaryApi<TError>
}

/** @tanstack/react-virtual v3. */
declare module "@tanstack/react-virtual" {
  type Key = number | string | bigint

  export interface VirtualItem {
    key: Key
    index: number
    start: number
    end: number
    size: number
    lane: number
  }

  export interface VirtualizerOptions<
    TScrollElement extends Element | Window,
    TItemElement extends Element,
  > {
    count: number
    getScrollElement: () => TScrollElement | null
    estimateSize: (index: number) => number
    overscan?: number
    horizontal?: boolean
    paddingStart?: number
    paddingEnd?: number
    gap?: number
    lanes?: number
    getItemKey?: (index: number) => Key
    measureElement?: (
      element: TItemElement,
      entry: ResizeObserverEntry | undefined,
      instance: Virtualizer<TScrollElement, TItemElement>
    ) => number
  }

  export class Virtualizer<
    TScrollElement extends Element | Window,
    TItemElement extends Element,
  > {
    getVirtualItems(): VirtualItem[]
    getTotalSize(): number
    measureElement: (node: TItemElement | null | undefined) => void
    measure(): void
    scrollToIndex(
      index: number,
      options?: { align?: "start" | "center" | "end" | "auto" }
    ): void
    scrollToOffset(toOffset: number): void
  }

  export function useVirtualizer<
    TScrollElement extends Element,
    TItemElement extends Element,
  >(
    options: VirtualizerOptions<TScrollElement, TItemElement>
  ): Virtualizer<TScrollElement, TItemElement>
}

/** @sentry/react v10, the calls a snippet makes to report an error. */
declare module "@sentry/react" {
  type Primitive =
    number | string | boolean | bigint | symbol | null | undefined

  interface ScopeContext {
    user: { id?: string | number; email?: string; username?: string }
    level: "fatal" | "error" | "warning" | "log" | "info" | "debug"
    extra: Record<string, unknown>
    contexts: Record<string, Record<string, unknown> | null>
    tags: { [key: string]: Primitive }
    fingerprint: string[]
  }
  interface EventHint {
    event_id?: string
    originalException?: unknown
    syntheticException?: Error | null
    data?: unknown
  }

  export type CaptureContext = Partial<ScopeContext>
  export type ExclusiveEventHintOrCaptureContext =
    | (CaptureContext & Partial<{ [key in keyof EventHint]: never }>)
    | (EventHint & Partial<{ [key in keyof ScopeContext]: never }>)

  export function captureException(
    exception: unknown,
    hint?: ExclusiveEventHintOrCaptureContext
  ): string
}

/** ic-siwe-js, the React bindings of Sign-In With Ethereum for the IC. */
declare module "ic-siwe-js/react" {
  import type { PropsWithChildren, ReactNode } from "react"

  // `ic-siwe-js` builds on `@dfinity/identity`, whose `DelegationIdentity`,
  // `Principal` and request types are not the ones of `@icp-sdk/core`: each
  // class declares private fields, so TypeScript treats the two packages'
  // copies as different types. These stand in for the `@dfinity/*` types with
  // that property, and only for the members the docs use.
  declare const dfinityRequest: unique symbol
  export type SiweRequest = { readonly [dfinityRequest]: true }
  export class SiweDelegationIdentity {
    private readonly dfinityBrand: true
    getPrincipal(): { toText(): string }
    transformRequest(request: SiweRequest): Promise<unknown>
  }

  export type SiweIdentityContextType = {
    isInitializing: boolean
    login: () => Promise<SiweDelegationIdentity | undefined>
    isLoggingIn: boolean
    clear: () => void
    identity?: SiweDelegationIdentity
    identityAddress?: string
  }

  /** The canister that issues the SIWE delegations is `canisterId`. */
  export function SiweIdentityProvider(
    props: PropsWithChildren<{ canisterId: string }>
  ): ReactNode
  export function useSiwe(): SiweIdentityContextType
}

/** react-intersection-observer v9. */
declare module "react-intersection-observer" {
  export interface IntersectionOptions extends IntersectionObserverInit {
    threshold?: number | number[]
    triggerOnce?: boolean
    skip?: boolean
    initialInView?: boolean
    onChange?: (inView: boolean, entry: IntersectionObserverEntry) => void
  }

  export type InViewHookResponse = [
    ref: (node?: Element | null) => void,
    inView: boolean,
    entry: IntersectionObserverEntry | undefined,
  ] & {
    ref: (node?: Element | null) => void
    inView: boolean
    entry?: IntersectionObserverEntry
  }

  export function useInView(options?: IntersectionOptions): InViewHookResponse
}
