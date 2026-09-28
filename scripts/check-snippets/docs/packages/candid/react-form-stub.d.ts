// A stand-in for the parts of `@tanstack/react-form` (v1) the candid docs
// snippets use. Only examples/tanstack-form-demo installs the package, and the
// checker links the dependencies of the packages/* workspaces alone, so the
// module resolves nowhere else. The shapes follow the package's declarations:
// a schema validator's input has to accept the form's values, and
// `AnyFieldApi` holds `any` values.
//
// This is a stopgap, and it is wider than this section: an ambient module
// declaration belongs to the whole program, so in a run that covers other
// sections it stands in for the package on their pages too, and it merges with
// the `@tanstack/react-form` stub of docs/examples/modules.d.ts (the two
// `useForm`s become overloads). It also wins over the installed package. The
// helper types carry this section's name so that merge cannot collide.
//
// The real package compiles every candid snippet: with "examples/tanstack-form-demo"
// added to DEPENDENCY_SOURCES in scripts/check-snippets.mjs and this file, its
// import in globals.ts and the `@tanstack/react-form` block of
// docs/examples/modules.d.ts removed, the candid pages and the examples'
// tanstack-form page both pass. Do that, and delete this file, once the
// checker can be changed.
declare module "@tanstack/react-form" {
  import type { ReactNode } from "react"

  /** What a Standard Schema validator (zod, valibot, arktype) exposes. */
  interface CandidDocsStandardSchema<TInput> {
    readonly "~standard": {
      readonly types?: { readonly input: TInput; readonly output: unknown }
    }
  }

  type CandidDocsFormValidator<TFormData> =
    | CandidDocsStandardSchema<TFormData>
    | ((props: { value: TFormData }) => unknown)

  export interface AnyFieldApi {
    name: string
    state: { value: any; meta: { errors: unknown[] } }
    handleChange(updater: unknown): void
    pushValue(value: unknown): void
    removeValue(index: number): void
  }

  interface CandidDocsFieldRenderProps {
    name: string
    children: (fieldApi: AnyFieldApi) => ReactNode
  }

  export interface AnyFormApi {
    handleSubmit(): Promise<void>
  }

  interface CandidDocsFormOptions<TFormData> {
    defaultValues?: TFormData
    validators?: {
      onChange?: CandidDocsFormValidator<NoInfer<TFormData>>
      onBlur?: CandidDocsFormValidator<NoInfer<TFormData>>
      onSubmit?: CandidDocsFormValidator<NoInfer<TFormData>>
    }
    onSubmit?: (props: { value: TFormData }) => void | Promise<void>
  }

  export function useForm<TFormData>(
    options?: CandidDocsFormOptions<TFormData>
  ): AnyFormApi & { Field: (props: CandidDocsFieldRenderProps) => ReactNode }

  export function Field(
    props: CandidDocsFieldRenderProps & { form: AnyFormApi }
  ): ReactNode
}
