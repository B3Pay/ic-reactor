// Third-party modules the examples pages' snippets import, which no workspace
// package installs, so the shared `ambient.d.ts` has no stub for them. Only
// what the snippets use is declared, as functions and under names of this
// section's own, so that another docs section's stub of the same module merges
// as overloads. `globals.ts` pulls this file in.

declare module "next/server" {
  export function connection(): Promise<void>
}

declare module "next/app" {
  import type { ComponentType } from "react"

  export interface AppProps {
    Component: ComponentType<Record<string, unknown>>
    pageProps: Record<string, unknown>
  }
}

declare module "@tanstack/react-query-devtools" {
  import type { ReactNode } from "react"

  export function ReactQueryDevtools(props: {
    initialIsOpen?: boolean
    position?: "top" | "bottom" | "left" | "right"
  }): ReactNode
}

declare module "@tanstack/react-form" {
  import type { ReactNode } from "react"

  /** What a Standard Schema validator (zod, valibot, arktype) exposes. */
  interface ExamplesDocsStandardSchema<TInput> {
    readonly "~standard": {
      readonly types?: { readonly input: TInput; readonly output: unknown }
    }
  }

  export function useForm<TFormData>(options?: {
    defaultValues?: TFormData
    validators?: {
      onChange?: ExamplesDocsStandardSchema<NoInfer<TFormData>>
    }
    onSubmit?: (props: { value: TFormData }) => void | Promise<void>
  }): {
    handleSubmit(): Promise<void>
    Field(props: {
      name: string
      children: (fieldApi: { name: string }) => ReactNode
    }): ReactNode
  }
}

/** The `$param` segments of a TanStack Router path. */
type ExamplesDocsPathParams<Path extends string> =
  Path extends `${string}$${infer Param}/${infer Rest}`
    ? { [K in Param | keyof ExamplesDocsPathParams<Rest>]: string }
    : Path extends `${string}$${infer Param}`
      ? { [K in Param]: string }
      : {}

declare module "@tanstack/react-router" {
  import type { ComponentType } from "react"

  export function createFileRoute<Path extends string>(
    path: Path
  ): (options: {
    component?: ComponentType
    loader?: (context: { params: ExamplesDocsPathParams<Path> }) => unknown
  }) => unknown
}

/**
 * The tanstack-router demo's `@/` alias reaches `src/`. Its reactor and query
 * modules are `reactor.ts` of this directory, and the alias is a wildcard so
 * that another docs section's exact stub of one of these modules wins.
 */
declare module "@/canisters/ledger/*" {
  export const ledgerReactor: (typeof import("./reactor"))["ledgerReactor"]
  export const icrc1NameQuery: (typeof import("./reactor"))["icrc1NameQuery"]
  export const useActorQuery: (typeof import("./reactor"))["ledgerHooks"]["useActorQuery"]
}
