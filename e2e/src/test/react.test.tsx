import React from "react"
import renderer, { act } from "react-test-renderer"
import {
  canisterId,
  idlFactory,
  hello_actor,
} from "../declarations/hello_actor"
import { createReactor } from "@ic-reactor/react"

describe("React Test", () => {
  it("should initialize", async () => {
    const { useActorState, initialize } = createReactor<typeof hello_actor>({
      canisterId,
      idlFactory,
      initializeOnCreate: false,
      isLocalEnv: true,
    })

    const Initialize = () => {
      const { initialized, initializing } = useActorState()

      return (
        <div>
          <span>
            {initializing
              ? "Initializing"
              : initialized
              ? "Initialized"
              : "Not initialized"}
          </span>
          <button onClick={() => initialize()}>Initialize</button>
        </div>
      )
    }

    let screen = renderer.create(<Initialize />)

    const initializeStatus = () =>
      screen.root.findAllByType("span")[0].props.children
    const initializeButton = () => screen.root.findAllByType("button")[0]

    expect(screen.toJSON()).toMatchSnapshot()

    expect(initializeStatus()).toEqual("Not initialized")

    await act(() => initializeButton().props.onClick())

    expect(initializeStatus()).toEqual("Initialized")

    expect(screen.toJSON()).toMatchSnapshot()
  })

  it("should call query method", async () => {
    const { useQueryCall } = createReactor<typeof hello_actor>({
      canisterId,
      idlFactory,
      isLocalEnv: true,
      verifyQuerySignatures: false,
    })

    const HelloComponent = () => {
      const { call, data, loading } = useQueryCall({
        functionName: "greet",
        args: ["Query Call"],
      })

      return (
        <div>
          <button onClick={call}>Say Hello</button>
          <span>
            {loading ? "Loading..." : data ? data.toString() : "Ready To call"}
          </span>
        </div>
      )
    }

    let screen = renderer.create(<HelloComponent />)

    const data = () => screen.root.findAllByType("span")[0]

    const button = () => screen.root.findAllByType("button")[0]

    expect(screen.toJSON()).toMatchSnapshot()

    expect(data().props.children).toEqual("Ready To call")

    await act(() => button().props.onClick())

    expect(data().props.children).toEqual("Hello, Query Call!")

    expect(screen.toJSON()).toMatchSnapshot()
  })

  it("should call update method", async () => {
    const { useUpdateCall } = createReactor<typeof hello_actor>({
      canisterId,
      idlFactory,
      isLocalEnv: true,
    })

    const HelloComponent = () => {
      const { call, data, loading } = useUpdateCall({
        functionName: "greet_update",
        args: ["Update Call"],
      })

      return (
        <div>
          <button onClick={call}>Say Hello</button>
          <span>
            {loading ? "Loading..." : data ? data.toString() : "Ready To call"}
          </span>
        </div>
      )
    }

    let screen = renderer.create(<HelloComponent />)

    const data = () => screen.root.findAllByType("span")[0]

    const button = () => screen.root.findAllByType("button")[0]

    expect(screen.toJSON()).toMatchSnapshot()

    expect(data().props.children).toEqual("Ready To call")

    await act(() => button().props.onClick())

    expect(data().props.children).toEqual("Hello, Update Call!")

    expect(screen.toJSON()).toMatchSnapshot()
  })
})
