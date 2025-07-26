// Shared utilities and types for the ic-reactor monorepo

export function noop() {}

export type DeepPartial<T> = {
  [P in keyof T]?: DeepPartial<T[P]>
}
