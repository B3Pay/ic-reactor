import React from "react"
import renderer, { act } from "react-test-renderer"
import {
  AgentProvider,
  CandidAdapterProvider,
  createActorContext,
} from "../src"

const { ActorProvider, useQueryCall } = createActorContext({
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
})

describe("createReactor", () => {
  it("should query", async () => {
    const TestComponent = ({}) => {
      const {
        call,
        data: version,
        loading,
      } = useQueryCall({ functionName: "icrc1_name", refetchOnMount: false })

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
        <CandidAdapterProvider>
          <ActorProvider>
            <TestComponent />
          </ActorProvider>
        </CandidAdapterProvider>
      </AgentProvider>
    )
    const versionStatus = () => screen.root.findAllByType("span")[0]

    const versionButton = () => screen.root.findAllByType("button")[0]

    expect(screen.toJSON()).toMatchSnapshot()

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1000))
    })

    expect(screen.toJSON()).toMatchSnapshot()

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1000))
    })

    expect(screen.toJSON()).toMatchSnapshot()

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1000))
    })

    expect(screen.toJSON()).toMatchSnapshot()

    expect(versionStatus().props.children).toEqual("Ready To call")

    await act(() => versionButton().props.onClick())

    expect(versionStatus().props.children).toEqual("Internet Computer")

    expect(screen.toJSON()).toMatchSnapshot()
  })
})
