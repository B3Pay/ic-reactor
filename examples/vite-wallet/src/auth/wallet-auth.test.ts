// Scenarios 2 and 3: one client whose `auth` offers Internet Identity and the
// dev account. A real `createClient` reads the auth here; it makes no call
// (its `fetch` refuses), since what is tested is who the client says calls,
// and what its keys are built for.
//
// Internet Identity is stood in for by the sign-in of `createTestClient()`,
// which has an AuthClient's surface: borrowed from a test client that is
// never used, as `@ic-reactor/core/testing` allows.
import { createClient, type Client } from "@ic-reactor/core"
import { createTestClient } from "@ic-reactor/core/testing"
import { afterEach, describe, expect, it, vi } from "vitest"
import { actor, type Actor } from "../canisters/ledger.ts"
import { SEED_1 } from "../test/test-wallet.tsx"
import { ICP_LEDGER } from "../use-canisters.ts"
import { createDevAccounts, type AccountStorage } from "./dev-accounts.ts"
import { createWalletAuth } from "./wallet-auth.ts"

const memoryStorage = (): AccountStorage => {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  }
}

/** A sign-in shaped like `AuthClient`, signed out, owned by nobody yet. */
function borrowedInternetIdentity() {
  const unused = createTestClient({ signedIn: false })
  unused.client.dispose()
  return unused.auth
}

const noNetwork: typeof fetch = async () => {
  throw new Error("this test makes no call")
}

let client: Client | undefined
afterEach(() => client?.dispose())

function setUp(options: { devAccounts?: boolean } = {}) {
  const internetIdentity = borrowedInternetIdentity()
  const devAccounts =
    options.devAccounts === false
      ? undefined
      : createDevAccounts(memoryStorage())
  client = createClient({
    network: "env",
    auth: () => createWalletAuth({ internetIdentity, devAccounts }),
    fetch: noNetwork,
  })
  const ledger = client.canister<Actor>(actor, { id: ICP_LEDGER })
  /** The caller segment of the keys the client builds now. */
  const keyCaller = () => String(client?.queryKey(ledger)[2])
  return { client, internetIdentity, devAccounts, keyCaller }
}

describe("the wallet's auth", () => {
  it("starts anonymous: reads keyed by the anonymous principal, no write allowed", () => {
    const { client, keyCaller } = setUp()
    expect(client.authState()).toEqual({
      status: "anonymous",
      principal: "2vxsx-fae",
    })
    expect(keyCaller()).toBe("2vxsx-fae")
  })

  it("signs in with Internet Identity when the options say so", async () => {
    const { client, keyCaller } = setUp()
    await client.signIn({ with: "internet-identity" })
    expect(client.authState()).toEqual({
      status: "signed-in",
      principal: SEED_1,
    })
    expect(keyCaller()).toBe(SEED_1)
  })

  it("signs in with a dev account, and signs Internet Identity out", async () => {
    const { client, internetIdentity, devAccounts, keyCaller } = setUp()
    await client.signIn({ with: "internet-identity" })

    await client.signIn({ with: "dev-account" })

    const dev = devAccounts?.list()[0]?.principal
    expect(client.caller()).toBe(dev)
    expect(keyCaller()).toBe(dev)
    expect(internetIdentity.getStatus().state).toBe("signed-out")
  })

  it("switches dev accounts with one change of caller, never anonymous in between", async () => {
    const { client, devAccounts } = setUp()
    await client.signIn({ with: "dev-account", account: 1 })
    const seen: string[] = []
    client.subscribe(() => seen.push(client.authState().principal))

    await client.signIn({ with: "dev-account", account: 2 })

    const second = devAccounts?.list()[1]?.principal
    expect(second).toBeDefined()
    expect(seen).toEqual([second])
    expect(client.caller()).toBe(second)
  })

  it("keeps the dev account until an Internet Identity sign-in has succeeded", async () => {
    const { client, internetIdentity, devAccounts } = setUp()
    await client.signIn({ with: "dev-account" })
    const dev = client.caller()
    // The Internet Identity window is closed without signing in.
    const closed = vi
      .spyOn(internetIdentity, "signIn")
      .mockRejectedValueOnce(new Error("the window was closed"))

    await expect(client.signIn({ with: "internet-identity" })).rejects.toThrow(
      "the window was closed"
    )
    expect(client.caller()).toBe(dev)

    closed.mockRestore()
    await client.signIn({ with: "internet-identity" })
    expect(client.caller()).toBe(SEED_1)
    expect(devAccounts?.getStatus().state).toBe("signed-out")
  })

  it("signs out of whichever source is signed in", async () => {
    const { client, devAccounts } = setUp()
    await client.signIn({ with: "dev-account" })
    await client.signOut()
    expect(client.authState().status).toBe("anonymous")
    expect(devAccounts?.getStatus().state).toBe("signed-out")
  })

  it("reports an expired Internet Identity session as expired, calling anonymously", async () => {
    const { client, internetIdentity } = setUp()
    await client.signIn({ with: "internet-identity" })
    internetIdentity.expire()
    expect(client.authState()).toEqual({
      status: "expired",
      principal: "2vxsx-fae",
    })
  })

  it("offers no dev account where there is none (a deployed page)", async () => {
    const { client } = setUp({ devAccounts: false })
    await expect(client.signIn({ with: "dev-account" })).rejects.toThrow(
      "The dev account is offered on a local page only."
    )
    await expect(client.signIn({ with: "passkey" })).rejects.toThrow(TypeError)
    expect(client.authState().status).toBe("anonymous")
  })

  it("is disposed with the client: Internet Identity with it, the tab's dev accounts not", async () => {
    const { client, internetIdentity, devAccounts } = setUp()
    await client.signIn({ with: "dev-account" })
    client.dispose()
    expect(internetIdentity.disposed).toBe(true)
    // The accounts outlive the client: the next client of the tab uses them.
    expect(devAccounts?.getStatus().state).toBe("signed-in")
  })
})
