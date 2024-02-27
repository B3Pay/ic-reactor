import React from "react"
import renderer, { act } from "react-test-renderer"
import { backend } from "./candid"
import { AgentProvider, createActorContext } from "../src"

const { ActorProvider, useQueryCall } = createActorContext<typeof backend>({
  canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
})

describe("createReactor", () => {
  it("should query", async () => {
    const TestComponent = ({}) => {
      const {
        call,
        data: version,
        loading,
      } = useQueryCall({ functionName: "version", refetchOnMount: false })

      return (
        <div>
          <button onClick={call}>Get Version</button>
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
        <ActorProvider>
          <TestComponent />
        </ActorProvider>
      </AgentProvider>
    )

    expect(screen.toJSON()).toMatchSnapshot()

    await act(async () => {
      await new Promise((r) => setTimeout(r, 3000))
    })

    expect(screen.toJSON()).toMatchSnapshot()

    const versionStatus = () => screen.root.findAllByType("span")[0]

    const versionButton = () => screen.root.findAllByType("button")[0]

    expect(versionStatus().props.children).toEqual("Ready To call")

    await act(() => versionButton().props.onClick())

    expect(versionStatus().props.children).toEqual("0.2.0")

    expect(screen.toJSON()).toMatchSnapshot()
  })
})
