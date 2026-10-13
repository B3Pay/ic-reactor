import { useCallback, useEffect, useRef, useState } from "react"

/** The state of one async task the user started (or a tab started). */
export type TaskState<T> =
  | { readonly status: "idle" }
  | { readonly status: "running" }
  | { readonly status: "done"; readonly value: T }
  | { readonly status: "failed"; readonly message: string }

/**
 * Runs an async task and keeps only the latest run's outcome: a run that
 * finishes after a newer one started (or after unmount) is dropped. For
 * one-off server-function calls and lazily loaded tools, not for canister
 * reads (those go through ic-reactor's query options).
 */
export function useTask<T>(): {
  state: TaskState<T>
  run(task: () => Promise<T>): void
  reset(): void
} {
  const [state, setState] = useState<TaskState<T>>({ status: "idle" })
  const latest = useRef(0)

  useEffect(
    () => () => {
      // Unmounted: no later setState from a run in flight.
      latest.current += 1
    },
    []
  )

  const run = useCallback((task: () => Promise<T>) => {
    const runId = ++latest.current
    setState({ status: "running" })
    task().then(
      (value) => {
        if (runId === latest.current) setState({ status: "done", value })
      },
      (error: unknown) => {
        if (runId === latest.current) {
          setState({
            status: "failed",
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }
    )
  }, [])

  const reset = useCallback(() => {
    latest.current += 1
    setState({ status: "idle" })
  }, [])

  return { state, run, reset }
}
