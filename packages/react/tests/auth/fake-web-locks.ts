/**
 * The Web Locks API (`navigator.locks`) as browsers implement it, for the parts
 * `@icp-sdk/auth` v10 uses. jsdom has none, and without it v10 takes no lock at
 * all, so a test could never see one tab's call take a lock from another's.
 * One lock manager serves the whole window, as one serves every tab of an
 * origin in a browser.
 *
 * - `request(name, callback)` queues for the exclusive lock and holds it until
 *   the value the callback returns settles; the request settles with it.
 * - `request(name, { steal: true }, callback)` takes the lock at once. The
 *   request that held it rejects with an `AbortError`, which is the only notice
 *   its holder gets, and its callback runs on without the lock.
 *
 * @returns A function that removes it again.
 */
export function installFakeWebLocks(): () => void {
  const held = new Map<
    string,
    { token: object; steal: (error: DOMException) => void }
  >()
  const queues = new Map<string, Array<() => void>>()

  const grantNext = (name: string) => {
    if (held.has(name)) return
    queues.get(name)?.shift()?.()
  }

  const request = (
    name: string,
    optionsOrCallback: LockOptions | LockGrantedCallback<unknown>,
    maybeCallback?: LockGrantedCallback<unknown>
  ): Promise<unknown> => {
    const options: LockOptions =
      typeof optionsOrCallback === "function" ? {} : optionsOrCallback
    const callback =
      typeof optionsOrCallback === "function"
        ? optionsOrCallback
        : maybeCallback!
    if (
      (options.mode ?? "exclusive") !== "exclusive" ||
      options.ifAvailable ||
      options.signal
    ) {
      throw new Error("The fake Web Locks take exclusive requests only")
    }

    return new Promise((resolve, reject) => {
      const token = {}
      const release = () => {
        if (held.get(name)?.token !== token) return
        held.delete(name)
        grantNext(name)
      }
      const grant = () => {
        held.set(name, { token, steal: reject })
        void Promise.resolve()
          .then(() => callback({ name, mode: "exclusive" } as Lock))
          .then(
            (value) => {
              release()
              resolve(value)
            },
            (error: unknown) => {
              release()
              reject(error)
            }
          )
      }

      if (options.steal) {
        const holder = held.get(name)
        if (holder) {
          held.delete(name)
          holder.steal(new DOMException("The lock was stolen", "AbortError"))
        }
        queues.set(name, [grant, ...(queues.get(name) ?? [])])
      } else {
        queues.set(name, [...(queues.get(name) ?? []), grant])
      }
      grantNext(name)
    })
  }

  const previous = Object.getOwnPropertyDescriptor(navigator, "locks")
  Object.defineProperty(navigator, "locks", {
    value: { request },
    configurable: true,
  })
  return () => {
    if (previous) {
      Object.defineProperty(navigator, "locks", previous)
    } else {
      delete (navigator as { locks?: unknown }).locks
    }
  }
}
