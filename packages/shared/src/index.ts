export function noop() {
  // eslint-disable-next-line no-console
  console.warn("No operation function called")
}

export type DeepPartial<T> = {
  [P in keyof T]?: DeepPartial<T[P]>
}
