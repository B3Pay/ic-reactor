/**
 * One React render against the replica: ReactorProvider builds the client,
 * useClient hands it to a component, and useQuery reads through it, as the
 * caller signed in now.
 */
import { createClient } from "@ic-reactor/core"
import { ReactorProvider, useClient } from "@ic-reactor/react"
import { useQuery } from "@tanstack/react-query"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { actor, type Actor } from "./declarations/hello_actor"
import { ed25519, network, switchableAuth, target } from "./replica"

afterEach(cleanup)

const wait = { timeout: 20_000 }

function Whoami() {
  const client = useClient()
  const hello = client.canister<Actor>(actor, target)
  const greeting = useQuery(client.queryOptions(hello, "greet", "React"))
  const caller = useQuery(client.queryOptions(hello, "whoami"))
  return (
    <>
      <p data-testid="greeting">{greeting.data ?? "…"}</p>
      <p data-testid="caller">{caller.data ?? "…"}</p>
    </>
  )
}

describe("React against the local replica", () => {
  it("renders what the canister answers, read as whoever is signed in", async () => {
    const alice = ed25519()
    const bob = ed25519()
    const { auth, switchTo } = switchableAuth(alice)

    render(
      <ReactorProvider
        client={() => createClient({ network, auth: () => auth })}
      >
        <Whoami />
      </ReactorProvider>
    )

    const greeting = await screen.findByText("Hello, React!", undefined, wait)
    expect(greeting.dataset.testid).toBe("greeting")
    // The canister saw Alice's principal, not the anonymous one.
    const caller = await screen.findByText(
      alice.getPrincipal().toText(),
      undefined,
      wait
    )
    expect(caller.dataset.testid).toBe("caller")

    // A switch re-renders the component, which reads again as Bob.
    act(() => switchTo(bob))
    await screen.findByText(bob.getPrincipal().toText(), undefined, wait)
  })
})
