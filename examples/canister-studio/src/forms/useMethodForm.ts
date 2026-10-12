import type { AnyFieldSchema } from "@candid-core/schema"
import { useEffect, useState } from "react"
import type { MethodInfo } from "../interface/types.ts"
import { nowNanos } from "./convert.ts"
import {
  argPath,
  checkCall,
  draftFromValue,
  fillNanos,
  initialDraft,
  isAtOrBelow,
  isBytes,
  isUnsetTime,
  mapDrafts,
  type CallCheck,
  type Draft,
  type DraftNote,
} from "./engine.ts"
import type { HintResolver } from "./hints.ts"

/** The state of one method's form. */
export interface FormState {
  /** The arguments the drafts were made for. */
  readonly args: readonly AnyFieldSchema[]
  readonly drafts: readonly Draft[]
  /** Paths whose issues show (blurred once). */
  readonly touched: ReadonlySet<string>
  /** A submit was attempted: every issue shows. */
  readonly showAll: boolean
  /** Paths set to the time of sending, and set again on submit. */
  readonly autoNow: ReadonlySet<string>
  /** "Now" defaults are applied after mount: never during a render. */
  readonly nowPending: boolean
  /** The field to focus after a failed submit. */
  readonly focusPath?: string
}

interface Seed {
  readonly method: MethodInfo
  readonly initialValues: readonly unknown[] | undefined
}

const NO_PATHS: ReadonlySet<string> = new Set()

function freshState(
  method: MethodInfo,
  values: readonly unknown[] | undefined,
  notes?: DraftNote[]
): FormState {
  return {
    args: method.args,
    drafts: method.args.map((schema, i) =>
      values !== undefined && values[i] !== undefined
        ? draftFromValue(schema, values[i], { notes, path: argPath(i) })
        : initialDraft(schema)
    ),
    touched: NO_PATHS,
    showAll: false,
    autoNow: NO_PATHS,
    nowPending: true,
  }
}

/** The same method: the same object, or the same name over the same schemas. */
function sameMethod(a: MethodInfo, b: MethodInfo): boolean {
  return (
    a === b ||
    (a.name === b.name &&
      a.args.length === b.args.length &&
      a.args.every((schema, i) => schema === b.args[i]))
  )
}

/**
 * Structural equality of argument values (bigint, bytes, arrays, plain
 * objects), so a parent that decodes its prefill again on every render does
 * not reset the form on every render.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  )
    return false
  if (isBytes(a) || isBytes(b)) {
    return (
      isBytes(a) &&
      isBytes(b) &&
      a.length === b.length &&
      a.every((byte, i) => byte === b[i])
    )
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => sameValue(v, b[i]))
    )
  }
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  return (
    ka.length === kb.length &&
    ka.every(
      (k) =>
        Object.hasOwn(b, k) &&
        sameValue(
          (a as Record<string, unknown>)[k],
          (b as Record<string, unknown>)[k]
        )
    )
  )
}

function sameSeed(a: Seed, method: MethodInfo, values: Seed["initialValues"]) {
  return (
    sameMethod(a.method, method) &&
    (a.initialValues === values || sameValue(a.initialValues, values))
  )
}

/** Whether `path` is one of `paths` or sits below one of them. */
const coveredBy = (paths: ReadonlySet<string>, path: string): boolean => {
  for (const p of paths) if (isAtOrBelow(path, p)) return true
  return false
}

/**
 * The form's state: drafts, touch state, "now" fields. A new method or new
 * prefill values (by structure) start a fresh form.
 */
export function useMethodForm(
  method: MethodInfo,
  initialValues: readonly unknown[] | undefined,
  hints: HintResolver | undefined
) {
  const [seed, setSeed] = useState<Seed>({ method, initialValues })
  const [state, setState] = useState<FormState>(() =>
    freshState(method, initialValues)
  )
  // Derived from props, during render (React re-renders at once, before
  // committing): no effect, so the old method's drafts never paint.
  let current = state
  if (!sameSeed(seed, method, initialValues)) {
    current = freshState(method, initialValues)
    setSeed({ method, initialValues })
    setState(current)
  }

  // "Now" defaults read the clock, so they wait for the browser: the server
  // and the hydrating render produce the same HTML.
  useEffect(() => {
    if (!current.nowPending) return
    setState((s) => {
      if (!s.nowPending) return s
      const auto = new Set(s.autoNow)
      const now = nowNanos()
      const drafts = mapDrafts(s.args, s.drafts, (at) => {
        const hint = hints?.({
          path: at.path,
          key: at.key,
          schema: at.schema,
          method: method.name,
        })
        if (hint?.nowByDefault !== true || !isUnsetTime(at.draft))
          return undefined
        auto.add(at.path)
        return fillNanos(at.schema, at.draft, now)
      })
      return { ...s, drafts, autoNow: auto, nowPending: false }
    })
  }, [current.nowPending, hints, method.name])

  const update = (patch: (s: FormState) => FormState) => setState(patch)

  return {
    state: current,
    setArg(index: number, draft: Draft) {
      update((s) => ({
        ...s,
        drafts: s.drafts.map((d, i) => (i === index ? draft : d)),
      }))
    },
    touch(path: string) {
      update((s) =>
        s.touched.has(path)
          ? s
          : { ...s, touched: new Set(s.touched).add(path) }
      )
    },
    isAutoNow: (path: string) => coveredBy(current.autoNow, path),
    setAutoNow(path: string, on: boolean) {
      update((s) => {
        const auto = new Set(
          [...s.autoNow].filter((p) => !isAtOrBelow(path, p))
        )
        if (on) auto.add(path)
        return { ...s, autoNow: auto }
      })
    },
    /**
     * Values from outside (JSON import): fresh drafts, issues hidden again.
     * Returns what could not be used as given, and was replaced.
     */
    load(values: readonly unknown[]): DraftNote[] {
      const notes: DraftNote[] = []
      setState(freshState(method, values, notes))
      return notes
    },
    reset() {
      setState(freshState(method, initialValues))
    },
    /**
     * The check a submit sends: the current drafts (never a deferred
     * render's), with "time of sending" fields set to now. On failure every
     * issue shows and the first invalid field takes the focus.
     */
    submit(): CallCheck {
      let drafts = current.drafts
      if (current.autoNow.size > 0) {
        const now = nowNanos()
        drafts = mapDrafts(current.args, drafts, (at) =>
          current.autoNow.has(at.path) &&
          !(at.draft.k === "opt" && !at.draft.present)
            ? fillNanos(at.schema, at.draft, now)
            : undefined
        )
      }
      const check = checkCall(current.args, drafts)
      update((s) => ({
        ...s,
        drafts,
        showAll: s.showAll || !check.ok,
        focusPath: check.ok ? undefined : check.issues[0]?.path,
      }))
      return check
    },
    focused() {
      update((s) =>
        s.focusPath === undefined ? s : { ...s, focusPath: undefined }
      )
    },
    focusOn(path: string) {
      update((s) => ({ ...s, focusPath: path }))
    },
  }
}
