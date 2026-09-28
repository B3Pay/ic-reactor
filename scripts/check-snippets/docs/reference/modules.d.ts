// Third-party modules the reference pages' examples import, which no workspace
// package installs, so the shared `ambient.d.ts` has no stub for them. Only
// what the snippets use is declared. `globals.ts` pulls this file in.

declare module "ic-siwe-js/react" {
  import type { Identity } from "@icp-sdk/core/agent"
  import type { ReactNode } from "react"

  export function SiweIdentityProvider(props: {
    canisterId: string
    children?: ReactNode
  }): ReactNode
  export function useSiwe(): {
    login(): void
    identity: Identity | undefined
    isLoggingIn: boolean
  }
}

/** The query objects and reactor of `ledger.ts`, which the app's `@/` alias reaches. */
type ReferenceDocsLedger = typeof import("./ledger")

declare module "@/canisters/ledger/reactor" {
  export const ledgerReactor: ReferenceDocsLedger["ledgerReactor"]
}

declare module "@/canisters/ledger/hooks" {
  export const icrc1NameQuery: ReferenceDocsLedger["icrc1NameQuery"]
  export const icrc1SymbolQuery: ReferenceDocsLedger["icrc1SymbolQuery"]
}

/** The `$param` segments of a TanStack Router path. */
type ReferenceDocsPathParams<Path extends string> =
  Path extends `${string}$${infer Param}/${infer Rest}`
    ? { [K in Param | keyof ReferenceDocsPathParams<Rest>]: string }
    : Path extends `${string}$${infer Param}`
      ? { [K in Param]: string }
      : {}

declare module "@tanstack/react-router" {
  import type { ComponentType } from "react"

  export function createFileRoute<Path extends string>(
    path: Path
  ): (options: {
    component?: ComponentType
    loader?: (context: { params: ReferenceDocsPathParams<Path> }) => unknown
  }) => unknown
}

declare module "react-hook-form" {
  import type { BaseSyntheticEvent } from "react"

  /**
   * `useForm` with the options object the real one takes. It declares a
   * required `options`, unlike the real `useForm(props?)`, so that a call
   * without arguments still meets the stub of another docs section, which
   * declares this module too.
   */
  export function useForm<TFieldValues extends object>(options: {
    defaultValues?: TFieldValues
  }): {
    register(
      name: keyof TFieldValues & string,
      options?: { required?: boolean }
    ): { name: string }
    handleSubmit(
      onValid: (fields: TFieldValues) => unknown
    ): (event?: BaseSyntheticEvent) => Promise<void>
    setError(
      name: (keyof TFieldValues & string) | "root" | `root.${string}`,
      error: { type?: string; message?: string }
    ): void
  }
}
