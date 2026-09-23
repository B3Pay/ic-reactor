// @vitest-environment node
import { describe, it, expect, vi } from "vitest"
import React, { Suspense } from "react"
import { renderToPipeableStream } from "react-dom/server"
import { Writable } from "node:stream"
import { QueryClient } from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { createActorHooks } from "../src/createActorHooks.js"
import { createSuspenseQuery } from "../src/createSuspenseQuery.js"

/**
 * `QueryClient.mount()` subscribes a client to TanStack's focus and online
 * managers, which are module singletons. While a suspense hook is suspended it
 * mounts its reactor's client during render, since its effect cannot run until
 * it commits. On a server that subscription would be shared by every request,
 * so a server render must never take it.
 */

interface TestActor {
  greet: ActorMethod<[string], string>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({ greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]) })

/** Stream a server render once every Suspense boundary has resolved. */
const renderToHtml = (element: React.ReactElement) =>
  new Promise<string>((resolve, reject) => {
    let html = ""
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        html += String(chunk)
        callback()
      },
    })
    sink.on("finish", () => resolve(html))
    const { pipe } = renderToPipeableStream(element, {
      onAllReady: () => pipe(sink),
      onShellError: reject,
      onError: reject,
    })
  })

describe("a server render", () => {
  it("never mounts the reactor's QueryClient, even while a suspense hook waits for data", async () => {
    const queryClient = new QueryClient()
    const reactor = new Reactor<TestActor>({
      clientManager: new ClientManager({
        queryClient,
        agentOptions: { host: "https://icp-api.io" },
      }),
      name: "greeter",
      canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
      idlFactory,
    })
    vi.spyOn(reactor, "callMethod").mockImplementation(
      (async ({ args }: { args?: string[] }) => `hello ${args?.[0]}`) as never
    )
    const mount = vi.spyOn(queryClient, "mount")

    const query = createSuspenseQuery(reactor, {
      functionName: "greet",
      args: ["alice"],
    })
    const { useActorSuspenseQuery } = createActorHooks(reactor)
    const Greetings = () => (
      <>
        <p>{query.useSuspenseQuery().data}</p>
        <p>
          {useActorSuspenseQuery({ functionName: "greet", args: ["bob"] }).data}
        </p>
      </>
    )

    const html = await renderToHtml(
      <Suspense fallback={<p>loading</p>}>
        <Greetings />
      </Suspense>
    )

    // Both hooks suspended, and then rendered their data...
    expect(html).toContain("hello alice")
    expect(html).toContain("hello bob")
    // ...without the client ever subscribing to the shared managers.
    expect(mount).not.toHaveBeenCalled()
  })
})
