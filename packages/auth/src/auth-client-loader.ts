import type { AuthClientLike, AuthenticationClientOptions } from "./types"

export type AuthClientConstructor = {
  new (options?: AuthenticationClientOptions): AuthClientLike
}

/**
 * Lazily loads the optional `@icp-sdk/auth` client constructor via dynamic
 * import and remembers whether the module is unavailable.
 *
 * Keeping the dynamic-import concern isolated lets {@link AuthenticationManager}
 * focus on the sign-in flow instead of module-resolution bookkeeping.
 *
 * @example
 * ```ts
 * const loader = new AuthClientLoader()
 * const AuthClient = await loader.load()
 * const client = AuthClient ? new AuthClient() : undefined
 * ```
 */
export class AuthClientLoader {
  private constructorRef?: AuthClientConstructor
  private constructorPromise?: Promise<AuthClientConstructor | undefined>
  private moduleMissing = false

  /** True once a load attempt has failed because the module is unavailable. */
  public get isModuleMissing(): boolean {
    return this.moduleMissing
  }

  /** The already-resolved constructor, if {@link load} has completed. */
  public get cachedConstructor(): AuthClientConstructor | undefined {
    return this.constructorRef
  }

  /**
   * Dynamically import and cache the `AuthClient` constructor.
   *
   * @returns The constructor, or `undefined` when the module is missing.
   * @throws If the module loads but does not export `AuthClient`.
   */
  public async load(): Promise<AuthClientConstructor | undefined> {
    if (this.constructorRef) {
      return this.constructorRef
    }

    if (!this.constructorPromise) {
      this.constructorPromise = import("@icp-sdk/auth/client")
        .then((authModule) => {
          const AuthClient = (
            authModule as { AuthClient?: AuthClientConstructor }
          ).AuthClient

          if (!AuthClient) {
            throw new Error("@icp-sdk/auth/client did not export AuthClient")
          }

          this.constructorRef = AuthClient
          return AuthClient
        })
        .catch((error) => {
          this.moduleMissing = true
          this.constructorPromise = undefined
          if (
            error instanceof Error &&
            error.message.includes("did not export AuthClient")
          ) {
            throw error
          }
          return undefined
        })
    }

    return this.constructorPromise
  }
}
