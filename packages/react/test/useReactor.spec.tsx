import React from "react"
import renderer, { act } from "react-test-renderer"
import { backend, idlFactory } from "./candid"
import { useReactor } from "../src"
import { AgentProvider } from "../src"
import { ActorHooks } from "../src/types"

describe("createReactor", () => {
  it("should query", async () => {
    const BackendActor = () => {
      const { hooks, fetchError, fetching } = useReactor<typeof backend>({
        canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
        idlFactory,
      })

      return fetching ? (
        <p>Loading Candid interface...</p>
      ) : fetchError ? (
        <p>Error: {fetchError}</p>
      ) : (
        hooks && <TestComponent {...hooks} />
      )
    }

    const TestComponent = ({ useQueryCall }: ActorHooks<typeof backend>) => {
      const { data: version, loading } = useQueryCall({
        functionName: "version",
      })

      return (
        <div>
          <span>
            {loading
              ? "Loading..."
              : version
              ? version.toString()
              : "Ready To call"}
          </span>
        </div>
      )
    }

    let screen = renderer.create(
      <AgentProvider>
        <BackendActor />
      </AgentProvider>
    )

    const versionStatus = () => screen.root.findAllByType("span")[0]

    expect(screen.toJSON()).toMatchSnapshot()

    expect(versionStatus().props.children).toEqual("Ready To call")

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    expect(screen.toJSON()).toMatchSnapshot()

    expect(versionStatus().props.children).toEqual("Loading...")

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1000))
    })

    expect(versionStatus().props.children).toEqual("0.2.0")

    expect(screen.toJSON()).toMatchSnapshot()
  })
})
