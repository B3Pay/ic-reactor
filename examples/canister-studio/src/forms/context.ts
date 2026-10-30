import type { AnyFieldSchema } from "@meantjs/schema"
import { createContext, useContext } from "react"
import type { Draft, FieldIssue } from "./engine.ts"
import type { FieldHint } from "./hints.ts"

/** What every field of one form shares: ids, hints, issues, touch state. */
export interface FormContextValue {
  /** The DOM id of the control at a path: the form's `useId()` plus the path. */
  idFor(path: string): string
  hint(at: {
    path: string
    key?: string
    schema: AnyFieldSchema
  }): FieldHint | undefined
  /** The issues a field shows now: once touched or after a submit attempt, plus the last call's. */
  issuesAt(path: string): readonly FieldIssue[]
  /** Whether a shown issue sits at `path` or below it (collapsed sections). */
  hasIssueBelow(path: string): boolean
  /**
   * The highest index of the vec at `path` whose item has a shown issue at
   * or below it, or -1: a paged list keeps that item on screen.
   */
  lastItemWithIssue(path: string): number
  touch(path: string): void
  /** A submit was attempted: every issue shows, and sections holding one open. */
  readonly showAll: boolean
  readonly callerPrincipal?: string
  /** The id of the form's datalist of known canisters, for principal inputs. */
  readonly datalistId: string
  /** Whether the time at `path` (or an ancestor) is refreshed when sending. */
  isAutoNow(path: string): boolean
  setAutoNow(path: string, on: boolean): void
}

export const FormContext = createContext<FormContextValue | null>(null)

export function useFormContext(): FormContextValue {
  const value = useContext(FormContext)
  if (value === null) throw new Error("form fields render inside a MethodForm")
  return value
}

/** The props every field component takes. */
export interface FieldProps {
  readonly schema: AnyFieldSchema
  readonly draft: Draft
  readonly onChange: (draft: Draft) => void
  readonly path: string
  /** The record key the field sits at, for hint lookup. */
  readonly fieldKey?: string
  /** The visible label; none for an opt's inner value or a lone argument. */
  readonly label?: string
  /** The accessible name when there is no visible label. */
  readonly a11yLabel?: string
  /** A hint the parent resolved (an opt's inner value shares its opt's). */
  readonly inheritedHint?: FieldHint
}

/** What `Field` hands each editor: the props, with the hint resolved. */
export interface EditorProps extends FieldProps {
  readonly hint?: FieldHint
}
