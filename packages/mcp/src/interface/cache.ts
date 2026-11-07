/**
 * A least-recently-used map with a bound on its entry count and, optionally,
 * on the total weight of its values (for example their size in bytes).
 * Reading an entry with `get` makes it the most recent; adding one past
 * either bound evicts the least recent until both hold again.
 */
export class Lru<K, V> {
  readonly #map = new Map<K, V>()
  readonly #maxEntries: number
  readonly #maxWeight: number
  readonly #weigh: (value: V) => number
  #weight = 0

  constructor(options: {
    maxEntries: number
    maxWeight?: number
    weigh?: (value: V) => number
  }) {
    this.#maxEntries = options.maxEntries
    this.#maxWeight = options.maxWeight ?? Number.POSITIVE_INFINITY
    this.#weigh = options.weigh ?? (() => 0)
  }

  get size(): number {
    return this.#map.size
  }

  get(key: K): V | undefined {
    if (!this.#map.has(key)) return undefined
    const value = this.#map.get(key) as V
    this.#map.delete(key)
    this.#map.set(key, value)
    return value
  }

  /** Like `get`, without making the entry the most recent. */
  peek(key: K): V | undefined {
    return this.#map.get(key)
  }

  has(key: K): boolean {
    return this.#map.has(key)
  }

  set(key: K, value: V): void {
    this.delete(key)
    this.#map.set(key, value)
    this.#weight += this.#weigh(value)
    while (
      this.#map.size > 0 &&
      (this.#map.size > this.#maxEntries || this.#weight > this.#maxWeight)
    ) {
      const oldest = this.#map.keys().next().value as K
      this.delete(oldest)
    }
  }

  delete(key: K): boolean {
    if (!this.#map.has(key)) return false
    this.#weight -= this.#weigh(this.#map.get(key) as V)
    return this.#map.delete(key)
  }

  clear(): void {
    this.#map.clear()
    this.#weight = 0
  }
}
