import React from "react"
import renderer, { act } from "react-test-renderer"
import { createReActor } from "../src"
import { backend, canisterId, idlFactory } from "./candid"

describe("createReActor", () => {
  it("should initialize", async () => {
    const { useActorStore } = createReActor<typeof backend>({
      idlFactory,
      canisterId,
    })

    const TestInitialize = () => {
      const { initialized } = useActorStore()

      return (
        <div>
          <span>{initialized ? "Initialized" : "Not initialized"}</span>
        </div>
      )
    }

    let screen = renderer.create(<TestInitialize />)

    const initializeStatus = () =>
      screen.root.findAllByType("span")[0].props.children
    const initializeButton = () => screen.root.findAllByType("button")[0]

    expect(screen.toJSON()).toMatchSnapshot()

    expect(initializeStatus()).toEqual("Not initialized")

    await act(() => initializeButton().props.onClick())

    expect(initializeStatus()).toEqual("Initialized")

    expect(screen.toJSON()).toMatchSnapshot()

    console.log(useActorStore().error)
  })

  it("should query", async () => {
    const { useQueryCall } = createReActor<typeof backend>({
      canisterId,
      idlFactory,
      initializeOnMount: false,
      host: "https://icp-api.io",
    })

    const TestComponent = () => {
      const {
        call,
        data: version,
        loading,
      } = useQueryCall({ functionName: "version", disableInitialCall: true })

      return (
        <div>
          <button onClick={() => call()}>Get Version</button>
          <span>
            {loading ? "Loading..." : version ? version : "Ready To call"}
          </span>
        </div>
      )
    }

    let screen = renderer.create(<TestComponent />)

    const versionStatus = () => screen.root.findAllByType("span")[0]

    const versionButton = () => screen.root.findAllByType("button")[0]

    expect(screen.toJSON()).toMatchSnapshot()

    expect(versionStatus().props.children).toEqual("Ready To call")

    await act(() => versionButton().props.onClick())

    expect(versionStatus().props.children).toEqual("0.2.0")

    expect(screen.toJSON()).toMatchSnapshot()
  })
})
