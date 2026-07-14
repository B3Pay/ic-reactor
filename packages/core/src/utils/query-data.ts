import type { ReactorQueryData } from "../types/reactor"

/** Convert a direct reactor result into a value TanStack Query can cache. */
export const toReactorQueryData = <T>(value: T): ReactorQueryData<T> =>
  (value === undefined ? null : value) as ReactorQueryData<T>
