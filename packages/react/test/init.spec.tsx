import React from "react"
import renderer, { act } from "react-test-renderer"
import { createReactor } from "../src"
import { backend, idlFactory } from "./candid"

describe("createReactor", () => {
  it("should initialize", async () => {
    const { useActorState, initialize } = createReactor<typeof backend>({
      idlFactory,
      canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
      initializeOnCreate: false,
    })

    const TestInitialize = () => {
      const { initialized } = useActorState()

      return (
        <div>
          <span>{initialized ? "Initialized" : "Not initialized"}</span>
          <button onClick={() => initialize()}>Initialize</button>
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
  })
})
