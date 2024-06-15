import React from "react"
import renderer, { act } from "react-test-renderer"
import { createReactor } from "../dist"
import { backend, idlFactory } from "./candid"

const { useActorState, useQueryCall, initialize } = createReactor<
  typeof backend
>({
  idlFactory,
  canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
  initializeOnCreate: false,
})

describe("createReactor", () => {
  it("should initialize", async () => {
    const TestInitialize = () => {
      const { initialized } = useActorState()

      return (
        <div>
          <span>{initialized ? "Initialized" : "Not initialized"}</span>
          <button onClick={initialize}>Initialize</button>
          <QueryCall />
        </div>
      )
    }

    const QueryCall = () => {
      const { data, call, loading } = useQueryCall({
        functionName: "version",
        refetchOnMount: false,
      })

      return (
        <div>
          <button onClick={call}>Get Version</button>
          <span>
            {loading ? "Loading..." : data ? data.toString() : "Ready To call"}
          </span>
        </div>
      )
    }

    let screen = renderer.create(<TestInitialize />)

    const initializeStatus = () =>
      screen.root.findAllByType("span")[0].props.children
    const versionStatus = () =>
      screen.root.findAllByType("span")[1].props.children

    const initializeButton = () => screen.root.findAllByType("button")[0]
    const getVersionButton = () => screen.root.findAllByType("button")[1]

    expect(screen.toJSON()).toMatchSnapshot()

    expect(initializeStatus()).toEqual("Not initialized")

    await act(() => initializeButton().props.onClick())

    expect(initializeStatus()).toEqual("Initialized")

    expect(screen.toJSON()).toMatchSnapshot()

    expect(versionStatus()).toEqual("Ready To call")
    expect(screen.toJSON()).toMatchSnapshot()

    await act(() => getVersionButton().props.onClick())

    expect(versionStatus()).toEqual("0.2.0")
    expect(screen.toJSON()).toMatchSnapshot()
  })
})
