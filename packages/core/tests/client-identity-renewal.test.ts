import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryObserver } from "@tanstack/query-core"
import { AnonymousIdentity, type Identity } from "@icp-sdk/core/agent"
import {
  DelegationChain,
  DelegationIdentity,
  Ed25519KeyIdentity,
} from "@icp-sdk/core/identity"
import { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "../src/client.js"

const CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"

/**
 * `updateAgent` sweeps the cache of every registered canister because query
 * keys carry no principal: an answer cached for one caller must not be served
 * to the next. It swept even when the new identity had the principal already
 * installed, which is what a renewed delegation, a sign-in while signed in
 * and an identity attribute request all install. Each one dropped every
 * inactive entry, refetched every mounted query and rejected every fetch in
 * flight, though every canister still saw the same caller (#719).
 */

/** A delegation from `root` to a fresh session key, as a sign-in returns. */
async function delegate(root: Ed25519KeyIdentity, minutes: number) {
  const sessionKey = Ed25519KeyIdentity.generate()
  const chain = await DelegationChain.create(
    root,
    sessionKey.getPublicKey(),
    new Date(Date.now() + minutes * 60_000)
  )
  return DelegationIdentity.fromDelegation(sessionKey, chain)
}

/** Resolves when the test says so. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/** Lets TanStack's scheduled refetches and notifications run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("ClientManager.updateAgent with the principal already installed", () => {
  let queryClient: QueryClient
  let clientManager: ClientManager
  let root: Ed25519KeyIdentity
  let signedIn: DelegationIdentity
  /** The identity installed when each query function ran. */
  let signedAs: Array<Identity | undefined>

  beforeEach(async () => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    clientManager = new ClientManager({
      queryClient,
      agentOptions: { host: "https://icp-api.io" },
    })
    clientManager.registerCanisterId(CANISTER_ID)
    root = Ed25519KeyIdentity.generate()
    signedIn = await delegate(root, 30)
    clientManager.updateAgent(signedIn)
    signedAs = []
  })

  /** A mounted query of the registered canister, answered `answer()`. */
  function mount(method: string, answer: () => Promise<string>) {
    const observer = new QueryObserver(queryClient, {
      queryKey: [CANISTER_ID, method],
      queryFn: () => {
        signedAs.push(clientManager.identity)
        return answer()
      },
      staleTime: Infinity,
    })
    return observer.subscribe(() => {})
  }

  it("keeps an inactive entry when a renewed delegation is installed", async () => {
    const key = [CANISTER_ID, "my_profile"]
    queryClient.setQueryData(key, { name: "Ada" })

    clientManager.updateAgent(await delegate(root, 60))

    expect(queryClient.getQueryData(key)).toEqual({ name: "Ada" })
  })

  it("does not refetch a mounted query that succeeded", async () => {
    const unmount = mount("balance", async () => "100")
    await vi.waitFor(() =>
      expect(queryClient.getQueryData([CANISTER_ID, "balance"])).toBe("100")
    )

    clientManager.updateAgent(await delegate(root, 60))
    await settle()

    expect(signedAs).toHaveLength(1)
    expect(
      queryClient.getQueryState([CANISTER_ID, "balance"])?.isInvalidated
    ).toBe(false)
    unmount()
  })

  it("lets a fetch in flight finish and caches its answer", async () => {
    const answer = deferred<string>()
    const pending = queryClient.fetchQuery({
      queryKey: [CANISTER_ID, "slow"],
      queryFn: () => answer.promise,
    })

    clientManager.updateAgent(await delegate(root, 60))
    answer.resolve("slow answer")

    await expect(pending).resolves.toBe("slow answer")
    expect(queryClient.getQueryData([CANISTER_ID, "slow"])).toBe("slow answer")
  })

  it("refetches a mounted query whose last fetch failed, as the new identity", async () => {
    let fail = true
    const unmount = mount("balance", async () => {
      if (fail) throw new Error("Invalid delegation expiry")
      return "100"
    })
    await vi.waitFor(() =>
      expect(queryClient.getQueryState([CANISTER_ID, "balance"])?.status).toBe(
        "error"
      )
    )
    fail = false

    const renewed = await delegate(root, 60)
    clientManager.updateAgent(renewed)

    await vi.waitFor(() =>
      expect(queryClient.getQueryData([CANISTER_ID, "balance"])).toBe("100")
    )
    expect(signedAs).toEqual([signedIn, renewed])
    unmount()
  })

  it("marks an inactive entry whose last fetch failed for a refetch", async () => {
    const key = [CANISTER_ID, "failed_earlier"]
    await queryClient
      .fetchQuery({
        queryKey: key,
        queryFn: async () => {
          throw new Error("Invalid delegation expiry")
        },
      })
      .catch(() => {})

    clientManager.updateAgent(await delegate(root, 60))

    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
  })

  it("keeps the cache when the same identity object is installed again", () => {
    const key = [CANISTER_ID, "my_profile"]
    queryClient.setQueryData(key, { name: "Ada" })

    clientManager.updateAgent(signedIn)

    expect(queryClient.getQueryData(key)).toEqual({ name: "Ada" })
  })

  it("keeps the cache when a signed-out app installs anonymous again", () => {
    clientManager.updateAgent(new AnonymousIdentity())
    const key = [CANISTER_ID, "public_stats"]
    queryClient.setQueryData(key, 7)

    clientManager.updateAgent(new AnonymousIdentity())

    expect(queryClient.getQueryData(key)).toBe(7)
  })

  it("installs the new identity and notifies subscribers", async () => {
    const heard: Identity[] = []
    clientManager.subscribe((identity) => heard.push(identity))
    const renewed = await delegate(root, 60)

    clientManager.updateAgent(renewed)

    expect(clientManager.identity).toBe(renewed)
    expect(heard).toEqual([renewed])
    expect((await clientManager.getUserPrincipal()).toText()).toBe(
      root.getPrincipal().toText()
    )
  })

  describe("still sweeps", () => {
    it("on a switch to another principal", async () => {
      const key = [CANISTER_ID, "my_profile"]
      queryClient.setQueryData(key, { name: "Ada" })

      clientManager.updateAgent(
        await delegate(Ed25519KeyIdentity.generate(), 30)
      )

      expect(queryClient.getQueryData(key)).toBeUndefined()
    })

    it("on sign-out to the anonymous identity", () => {
      const key = [CANISTER_ID, "my_profile"]
      queryClient.setQueryData(key, { name: "Ada" })

      clientManager.updateAgent(new AnonymousIdentity())

      expect(queryClient.getQueryData(key)).toBeUndefined()
    })

    it("and cancels a fetch in flight on a switch to another principal", async () => {
      const pending = queryClient.fetchQuery({
        queryKey: [CANISTER_ID, "slow"],
        queryFn: () => new Promise<string>(() => {}),
      })

      clientManager.updateAgent(Ed25519KeyIdentity.generate())

      await expect(pending).rejects.toMatchObject({ revert: true })
    })

    it("when an identity object installed earlier changed its principal", () => {
      // A wrapper that switches accounts internally and installs itself
      // again expects the sweep, so the principal it had when it was
      // installed is what counts, not the one it reports now.
      let current = Principal.fromText("aaaaa-aa")
      const wrapper: Identity = {
        getPrincipal: () => current,
        transformRequest: (request) => signedIn.transformRequest(request),
      }
      clientManager.updateAgent(wrapper)
      const key = [CANISTER_ID, "my_profile"]
      queryClient.setQueryData(key, { name: "Ada" })

      current = Ed25519KeyIdentity.generate().getPrincipal()
      clientManager.updateAgent(wrapper)

      expect(queryClient.getQueryData(key)).toBeUndefined()
    })

    it("on the first call after construction, whatever it installs", () => {
      // Until something is installed the manager cannot say whose answers
      // the cache holds, so the agent's starting anonymous identity is not
      // taken as installed.
      const fresh = new ClientManager({
        queryClient,
        agentOptions: { host: "https://icp-api.io" },
      })
      fresh.registerCanisterId(CANISTER_ID)
      const key = [CANISTER_ID, "my_profile"]
      queryClient.setQueryData(key, { name: "Ada" })

      fresh.updateAgent(new AnonymousIdentity())

      expect(queryClient.getQueryData(key)).toBeUndefined()
    })
  })
})
