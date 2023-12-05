import React from "react"
import renderer, { act } from "react-test-renderer"
import { createReActor } from "../src"
import { createActor } from "./candid"

describe("createReActor", () => {
  it("should initialize", async () => {
    const { ReActorProvider, initialize, useReActor } = createReActor(
      (agent) =>
        createActor("xeka7-ryaaa-aaaal-qb57a-cai", {
          agent,
        }),
      {
        initializeOnMount: false,
        host: "https://icp-api.io",
      }
    )

    const TestInitialize = () => {
      const { initialized, initializing } = useReActor()
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

    let screen = renderer.create(
      <ReActorProvider>
        <TestInitialize />
      </ReActorProvider>
    )

    const initializeStatus = () =>
      screen.root.findAllByType("span")[0].props.children
    const initializeButton = () => screen.root.findAllByType("button")[0]

    expect(screen.toJSON()).toMatchSnapshot()

    expect(initializeStatus()).toEqual("Not initialized")

    await act(() => initializeButton().props.onClick())

    expect(initializeStatus()).toEqual("Initialized")

    expect(screen.toJSON()).toMatchSnapshot()
  })

  it("should query", async () => {
    const { ReActorProvider, useQueryCall } = createReActor(
      (agent) =>
        createActor("xeka7-ryaaa-aaaal-qb57a-cai", {
          agent,
        }),
      {
        host: "https://icp-api.io",
      }
    )

    const TestComponent = () => {
      const {
        recall,
        data: version,
        loading,
      } = useQueryCall({ functionName: "version", disableInitialCall: true })

      return (
        <div>
          <button onClick={() => recall()}>Get Version</button>
          <span>
            {loading ? "Loading..." : version ? version : "Ready To call"}
          </span>
        </div>
      )
    }

    let screen = renderer.create(
      <ReActorProvider>
        <TestComponent />
      </ReActorProvider>
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
