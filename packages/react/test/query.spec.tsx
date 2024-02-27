import React from "react"
import renderer, { act } from "react-test-renderer"
import { createReactor } from "../src"
import { backend, idlFactory } from "./candid"
import { CreateReactorCoreParameters } from "../src/types"

const config: CreateReactorCoreParameters = {
  canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
  idlFactory,
}

const { useAuth, useQueryCall, useUpdateCall } =
  createReactor<typeof backend>(config)

describe("createReactor", () => {
  it("should query on mount", async () => {
    const TestComponent = () => {
      const { data, loading } = useQueryCall({
        functionName: "version",
      })

      return (
        <div>
          <span>
            {loading ? "Loading..." : data ? data.toString() : "Ready To call"}
          </span>
        </div>
      )
    }

    let screen = renderer.create(<TestComponent />)

    const versionStatus = () => screen.root.findAllByType("span")[0]

    expect(versionStatus().props.children).toEqual("Ready To call")
    expect(screen.toJSON()).toMatchSnapshot()

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1000))
    })

    expect(versionStatus().props.children).toEqual("0.2.0")
    expect(screen.toJSON()).toMatchSnapshot()
  })

  it("should query manually", async () => {
    const TestComponent = () => {
      const { call, data, loading } = useQueryCall({
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
