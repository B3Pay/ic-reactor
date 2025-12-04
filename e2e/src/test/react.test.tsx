import React from "react"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
  cleanup,
} from "@testing-library/react"

GlobalRegistrator.register()

import { describe, it, expect, afterEach } from "bun:test"
import {
  canisterId,
  idlFactory,
  hello_actor,
} from "../declarations/hello_actor"
import { createReactor } from "@ic-reactor/react"
import * as matchers from "@testing-library/jest-dom/matchers"

expect.extend(matchers)

afterEach(() => {
  cleanup()
})

describe("React Test", () => {
  it.only("should initialize", async () => {
    const { useActorState, initialize } = createReactor<typeof hello_actor>({
      canisterId,
      idlFactory,
      initializeOnCreate: false,
      withProcessEnv: true,
    })

    const Initialize = () => {
      const { initialized, initializing } = useActorState()

      return (
        <div>
          <span data-testid="status">
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

    const { asFragment } = render(<Initialize />)

    expect(asFragment()).toMatchSnapshot()

    expect(screen.getByTestId("status")).toHaveTextContent("Not initialized")

    await act(async () => {
      fireEvent.click(screen.getByText("Initialize"))
    })

    expect(screen.getByTestId("status")).toHaveTextContent("Initialized")

    expect(asFragment()).toMatchSnapshot()
  })

  it("should call query method", async () => {
    const { useQueryCall } = createReactor<typeof hello_actor>({
      canisterId,
      idlFactory,
      withLocalEnv: true,
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
          <span data-testid="data">
            {loading ? "Loading..." : data ? data.toString() : "Ready To call"}
          </span>
        </div>
      )
    }

    const { asFragment } = render(<HelloComponent />)

    expect(asFragment()).toMatchSnapshot()

    expect(screen.getByTestId("data")).toHaveTextContent("Ready To call")

    await act(async () => {
      fireEvent.click(screen.getByText("Say Hello"))
    })

    await waitFor(() => {
      expect(screen.getByTestId("data")).toHaveTextContent("Hello, Query Call!")
    })

    expect(asFragment()).toMatchSnapshot()
  })

  it("should call update method", async () => {
    const { useUpdateCall } = createReactor<typeof hello_actor>({
      canisterId,
      idlFactory,
      withLocalEnv: true,
    })

    const HelloComponent = () => {
      const { call, data, loading } = useUpdateCall({
        functionName: "greet_update",
        args: ["Update Call"],
      })

      return (
        <div>
          <button onClick={call}>Say Hello</button>
          <span data-testid="data">
            {loading ? "Loading..." : data ? data.toString() : "Ready To call"}
          </span>
        </div>
      )
    }

    const { asFragment } = render(<HelloComponent />)

    expect(asFragment()).toMatchSnapshot()

    expect(screen.getByTestId("data")).toHaveTextContent("Ready To call")

    await act(async () => {
      fireEvent.click(screen.getByText("Say Hello"))
    })

    await waitFor(() => {
      expect(screen.getByTestId("data")).toHaveTextContent(
        "Hello, Update Call!"
      )
    })

    expect(asFragment()).toMatchSnapshot()
  })
})
