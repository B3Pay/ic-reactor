import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ActorMethod } from "@icp-sdk/core/agent"
import { QueryClient, onlineManager } from "@tanstack/query-core"
import { IDL } from "@icp-sdk/core/candid"
import { Reactor } from "../src/reactor.js"
import { ClientManager } from "../src/client.js"

/**
 * `fetchQuery` takes further TanStack Query options for the fetch, so the
 * React query factories can run `fetch()` with their config's `retry`,
 * `networkMode` and `meta` while still going through the reactor, where a
 * subclass may override `fetchQuery`.
 */

interface GreeterActor {
  greet: ActorMethod<[string], string>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({ greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]) })

describe("Reactor.fetchQuery options", () => {
  let queryClient: QueryClient
  let reactor: Reactor<GreeterActor>
  let failuresLeft: number

  beforeEach(() => {
    queryClient = new QueryClient()
    reactor = new Reactor<GreeterActor>({
      clientManager: new ClientManager({
        queryClient,
        agentOptions: { host: "https://icp-api.io" },
      }),
      name: "greeter",
      canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
      idlFactory,
    })
    failuresLeft = 0
    vi.spyOn(reactor, "callMethod").mockImplementation((async ({
      args,
    }: {
      args: [string]
    }) => {
      if (failuresLeft > 0) {
        failuresLeft--
        throw new Error("boundary node timeout")
      }
      return `hello ${args[0]}`
    }) as never)
  })

  afterEach(() => onlineManager.setOnline(true))

  it("retries as the options say", async () => {
    failuresLeft = 2
    await expect(
      reactor.fetchQuery(
        { functionName: "greet", args: ["alice"] },
        { retry: 2, retryDelay: 1 }
      )
    ).resolves.toBe("hello alice")
  })

  it("runs offline with networkMode: always", async () => {
    onlineManager.setOnline(false)
    const result = await Promise.race([
      reactor.fetchQuery(
        { functionName: "greet", args: ["bob"] },
        { networkMode: "always" }
      ),
      new Promise((resolve) => setTimeout(() => resolve("timed out"), 200)),
    ])
    expect(result).toBe("hello bob")
  })

  it("keeps the key and query function from params", async () => {
    await reactor.fetchQuery(
      { functionName: "greet", args: ["carol"] },
      // A caller outside TypeScript could pass these; params must win.
      { queryKey: ["elsewhere"], queryFn: () => "forged" } as never
    )

    expect(
      queryClient.getQueryData(
        reactor.generateQueryKey({ functionName: "greet", args: ["carol"] })
      )
    ).toBe("hello carol")
    expect(queryClient.getQueryData(["elsewhere"])).toBeUndefined()
  })
})
