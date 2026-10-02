/**
 * `installFakeReplica` (internal: the testing entry exports only
 * `createTestClient`, which never stubs `globalThis.fetch`): the same fake
 * replica, put in `globalThis.fetch` for code that builds its own agents.
 *
 * The request checks and the fault hooks are `createFakeReplica`'s and are
 * tested with it. What is tested here is what only the global stub does:
 * answering an agent that was built without a `fetch` of its own, handing on
 * every request that is not the IC API, stacking with other fakes, and putting
 * back exactly the `fetch` it replaced.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  HttpAgent,
  type HttpAgentOptions,
  type Identity,
} from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import {
  installFakeReplica,
  type FakeCanister,
  type InstalledFakeReplica,
} from "../src/testing/fake-replica.js"

const HOST = "http://localhost:4943"
const CANISTER = "rdmx6-jaaaa-aaaaa-aaadq-cai"
const OTHER_HOST = "http://127.0.0.1:8080"

// Every test below puts back what it replaced, so the file leaves the global
// `fetch` as it found it.
const originalFetch = globalThis.fetch
afterEach(() => {
  expect(globalThis.fetch).toBe(originalFetch)
})

const answerWithCaller: NonNullable<FakeCanister["query"]> = (
  _method,
  _arg,
  { caller }
) => new Uint8Array(IDL.encode([IDL.Principal], [caller]))

type NodeKeyStore = NonNullable<HttpAgentOptions["subnetNodeKeyExpirableStore"]>

/** A store of node keys for one agent, in place of the shared one. */
function nodeKeysOfOneAgent(): NodeKeyStore {
  const entries = new Map<string, Parameters<NodeKeyStore["set"]>[1]>()
  return {
    expirationTime: 60_000,
    get: (key) => Promise.resolve(entries.get(key)),
    set: (key, value) => {
      entries.set(key, value)
      return Promise.resolve()
    },
    delete: (key) => {
      entries.delete(key)
      return Promise.resolve()
    },
  }
}

/**
 * An agent built with no `fetch` option, which binds the global one as it
 * finds it, so it must be built while the fake is installed.
 */
async function whoamiQueryAs(
  identity: Identity | undefined,
  host: string
): Promise<Principal> {
  const agent = HttpAgent.createSync({
    host,
    identity,
    shouldFetchRootKey: true,
    retryTimes: 0,
    subnetNodeKeyExpirableStore: nodeKeysOfOneAgent(),
  })
  const response = await agent.query(CANISTER, {
    methodName: "whoami_query",
    arg: new Uint8Array(IDL.encode([], [])),
  })
  if (response.status !== "replied") throw new Error("the query was rejected")
  return IDL.decode(
    [IDL.Principal],
    response.reply.arg
  )[0] as unknown as Principal
}

describe("an installed fake replica", () => {
  it("answers an agent that is built with no fetch of its own", async () => {
    const replica = installFakeReplica({
      host: HOST,
      canisters: { [CANISTER]: { query: answerWithCaller } },
    })
    try {
      expect((await whoamiQueryAs(undefined, HOST)).isAnonymous()).toBe(true)
      expect(
        replica.requests.filter((request) => request.endpoint === "query")
      ).toHaveLength(1)
    } finally {
      replica.restore()
    }
  })

  it("answers http://127.0.0.1:4943 when no host is given", async () => {
    const replica = installFakeReplica({
      canisters: { [CANISTER]: { query: answerWithCaller } },
    })
    try {
      expect(replica.host).toBe("http://127.0.0.1:4943")
      expect((await whoamiQueryAs(undefined, replica.host)).isAnonymous()).toBe(
        true
      )
    } finally {
      replica.restore()
    }
  })

  it("has the fault hooks of the fake it wraps", async () => {
    const replica = installFakeReplica({
      host: HOST,
      canisters: { [CANISTER]: { query: answerWithCaller } },
    })
    try {
      replica.refuseNext(429)

      await expect(whoamiQueryAs(undefined, HOST)).rejects.toMatchObject({
        code: { status: 429 },
      })
      expect(replica.requests.some((request) => request.refused)).toBe(true)
    } finally {
      replica.restore()
    }
  })

  it("fails a canister call sent to another host at once, naming its own", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const replica = installFakeReplica({ host: HOST })
    try {
      await expect(
        globalThis.fetch("https://icp-api.io/api/v2/status")
      ).rejects.toThrow(
        `fake replica: no route to https://icp-api.io. The fake answers ${HOST}`
      )
    } finally {
      replica.restore()
      logged.mockRestore()
    }
  })

  it("logs a misrouted origin once, as the agent and the query retry it", async () => {
    // Retries can hold the thrown error back until after the test timed
    // out, so the log is what names the cause.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const replica = installFakeReplica({ host: HOST })
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await expect(
          globalThis.fetch(
            `http://localhost:3000/api/v3/canister/${CANISTER}/query`
          )
        ).rejects.toThrow("fake replica: no route to http://localhost:3000")
      }
      await expect(
        globalThis.fetch("https://icp-api.io/api/v2/status")
      ).rejects.toThrow("fake replica: no route to https://icp-api.io")

      expect(logged.mock.calls.map(([message]) => message)).toEqual([
        expect.stringContaining("no route to http://localhost:3000"),
        expect.stringContaining("no route to https://icp-api.io"),
      ])
    } finally {
      replica.restore()
      logged.mockRestore()
    }
  })

  it("hands any other request to the fetch it replaced", async () => {
    const previous = globalThis.fetch
    const seen: string[] = []
    globalThis.fetch = ((input: RequestInfo | URL) => {
      seen.push(String(input))
      return Promise.resolve(new Response("ok"))
    }) as typeof fetch
    const replica = installFakeReplica({ host: HOST })
    try {
      const response = await globalThis.fetch("https://example.com/data.json")

      expect(await response.text()).toBe("ok")
      expect(seen).toEqual(["https://example.com/data.json"])
    } finally {
      replica.restore()
      globalThis.fetch = previous
    }
  })

  describe("hands on what is not the IC API, on any origin", () => {
    const previous = globalThis.fetch
    let seen: string[]
    let replica: InstalledFakeReplica

    beforeEach(() => {
      seen = []
      globalThis.fetch = ((input: RequestInfo | URL) => {
        seen.push(String(input))
        return Promise.resolve(new Response("ok"))
      }) as typeof fetch
      replica = installFakeReplica({ host: HOST })
    })

    afterEach(() => {
      replica.restore()
      globalThis.fetch = previous
      vi.unstubAllGlobals()
    })

    it("such as an app's own versioned REST API on another origin", async () => {
      // An /api/v1/ path is not the IC API, and a mock such as MSW may be
      // the fetch underneath answering it.
      const response = await globalThis.fetch(
        "https://api.example.com/api/v1/users"
      )

      expect(await response.text()).toBe("ok")
      expect(seen).toEqual(["https://api.example.com/api/v1/users"])
    })

    it("such as a page's own files on the fake's host", async () => {
      // A fake answering a page's origin shares it with the app.
      const response = await globalThis.fetch(`${HOST}/config.json`)

      expect(await response.text()).toBe("ok")
      expect(seen).toEqual([`${HOST}/config.json`])
    })

    it("such as a path an app asks for, read against the page", async () => {
      vi.stubGlobal("location", new URL("http://localhost:3000/app"))

      const response = await globalThis.fetch("/config.json")

      expect(await response.text()).toBe("ok")
      expect(seen).toEqual(["/config.json"])
    })
  })

  describe("with no host given", () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it("answers the page's origin when it is local, as an agent with no host calls it", async () => {
      // As in Vitest's jsdom and happy-dom environments.
      vi.stubGlobal("location", new URL("http://localhost:3000/"))
      const replica = installFakeReplica({
        canisters: { [CANISTER]: { query: answerWithCaller } },
      })
      try {
        expect(replica.host).toBe("http://localhost:3000")
        expect(
          (await whoamiQueryAs(undefined, replica.host)).isAnonymous()
        ).toBe(true)
      } finally {
        replica.restore()
      }
    })

    it.each([
      ["a mainnet page", "https://abcde-aaaaa-aaaaa-aaaaa-cai.icp0.io/"],
      ["an opaque origin", "file:///tmp/index.html"],
    ])("answers http://127.0.0.1:4943 on %s", (_, href) => {
      vi.stubGlobal("location", new URL(href))
      const replica = installFakeReplica()
      try {
        expect(replica.host).toBe("http://127.0.0.1:4943")
      } finally {
        replica.restore()
      }
    })
  })

  it("lets two fakes on two hosts answer side by side", async () => {
    const first = installFakeReplica({
      host: HOST,
      canisters: { [CANISTER]: { query: answerWithCaller } },
    })
    const second = installFakeReplica({
      host: OTHER_HOST,
      canisters: { [CANISTER]: { query: answerWithCaller } },
    })
    try {
      await whoamiQueryAs(undefined, HOST)
      await whoamiQueryAs(undefined, OTHER_HOST)

      const queries = (replica: InstalledFakeReplica) =>
        replica.requests.filter((request) => request.endpoint === "query")
      expect(queries(first)).toHaveLength(1)
      expect(queries(second)).toHaveLength(1)
    } finally {
      second.restore()
      first.restore()
    }
  })

  it("puts back the fetch it replaced", () => {
    const previous = globalThis.fetch
    const replica = installFakeReplica()

    expect(globalThis.fetch).not.toBe(previous)
    replica.restore()
    expect(globalThis.fetch).toBe(previous)
  })

  it("puts back the fetch it replaced when fakes are restored out of order", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const previous = globalThis.fetch
    const first = installFakeReplica({ host: OTHER_HOST })
    const second = installFakeReplica({ host: HOST })
    try {
      first.restore()
      // The second fake stays in place, and no longer hands the first
      // one's host on to it.
      expect(globalThis.fetch).not.toBe(previous)
      await expect(
        globalThis.fetch(`${OTHER_HOST}/api/v2/status`)
      ).rejects.toThrow(`no route to ${OTHER_HOST}`)

      second.restore()
      // It used to put the first fake back, which then answered every
      // later test in the file.
      expect(globalThis.fetch).toBe(previous)
    } finally {
      globalThis.fetch = previous
      logged.mockRestore()
    }
  })

  it("answers where no fetch was installed before it", async () => {
    // As in a test environment with no fetch of its own.
    const previous = globalThis.fetch
    Reflect.deleteProperty(globalThis, "fetch")
    const replica = installFakeReplica({
      host: HOST,
      canisters: { [CANISTER]: { query: answerWithCaller } },
    })
    try {
      expect((await whoamiQueryAs(undefined, HOST)).isAnonymous()).toBe(true)
    } finally {
      replica.restore()
      globalThis.fetch = previous
    }
  })

  it("takes out a wrapper a test put around it", () => {
    // As a test that drops a response does: its wrapper calls the fake, and
    // left in place it would answer every later test from this one's fake.
    const previous = globalThis.fetch
    const replica = installFakeReplica({ host: HOST })
    const fake = globalThis.fetch
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      fake(input, init)) as typeof fetch
    try {
      replica.restore()

      expect(globalThis.fetch).toBe(previous)
    } finally {
      globalThis.fetch = previous
    }
  })

  it("leaves a fetch installed over it in place when restored again", () => {
    const previous = globalThis.fetch
    const replica = installFakeReplica()
    replica.restore()
    const stub = (() => Promise.resolve(new Response("stub"))) as typeof fetch
    globalThis.fetch = stub
    try {
      replica.restore()

      expect(globalThis.fetch).toBe(stub)
    } finally {
      globalThis.fetch = previous
    }
  })

  it("refuses a canister key that is not a canister ID", () => {
    expect(() =>
      installFakeReplica({ canisters: { "test-canister": {} } })
    ).toThrow('"test-canister" in `canisters` is not a canister ID')
  })
})
