import React from "react"
import renderer, { act } from "react-test-renderer"
import { backend, idlFactory } from "./candid"
import { AgentProvider, createReactorContext } from "../src"

describe("createReactor", () => {
  it("should query", async () => {
    const { ActorProvider, useQueryCall } = createReactorContext<
      typeof backend
    >({
      canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
      idlFactory,
    })

    const TestComponent = ({}) => {
      const {
        call,
        data: version,
        loading,
      } = useQueryCall({ functionName: "version" })

      return (
        <div>
          <button onClick={() => call()}>Get Version</button>
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

    const versionStatus = () => screen.root.findAllByType("span")[0]

    const versionButton = () => screen.root.findAllByType("button")[0]

    expect(screen.toJSON()).toMatchSnapshot()

    expect(versionStatus().props.children).toEqual("Ready To call")

    await act(() => versionButton().props.onClick())

    expect(versionStatus().props.children).toEqual("0.2.0")

    expect(screen.toJSON()).toMatchSnapshot()
  })
})
