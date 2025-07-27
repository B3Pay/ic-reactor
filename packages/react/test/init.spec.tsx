import React from "react"
import { describe, it, expect } from "bun:test"
import { render, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createReactor } from "../dist"
import { backend, idlFactory } from "./candid"

const { useActorState, useQueryCall, initialize } = createReactor<
  typeof backend
>({
  idlFactory,
  canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
  initializeOnCreate: false,
})

describe("Initialization Tests", () => {
  it("should handle initialization and queries", async () => {
    const user = userEvent.setup()

    const TestInitialize = () => {
      const { initialized } = useActorState()

      return (
        <div>
          <span data-testid="init-status">
            {initialized ? "Initialized" : "Not initialized"}
          </span>
          <button data-testid="init-button" onClick={initialize}>
            Initialize
          </button>
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
          <button data-testid="get-version-button" onClick={call}>
            Get Version
          </button>
          <span data-testid="version-status">
            {loading ? "Loading..." : data ? data.toString() : "Ready To call"}
          </span>
        </div>
      )
    }

    const { container } = render(<TestInitialize />)

    const initStatus = container.querySelector(
      '[data-testid="init-status"]'
    ) as HTMLElement
    const versionStatus = container.querySelector(
      '[data-testid="version-status"]'
    ) as HTMLElement
    const initButton = container.querySelector(
      '[data-testid="init-button"]'
    ) as HTMLElement
    const getVersionButton = container.querySelector(
      '[data-testid="get-version-button"]'
    ) as HTMLElement

    // Check initial state
    expect(initStatus.textContent).toBe("Not initialized")

    // Initialize
    await user.click(initButton)

    await waitFor(() => {
      expect(initStatus.textContent).toBe("Initialized")
    })

    // Check version call is ready
    expect(versionStatus.textContent).toBe("Ready To call")

    // Make version call
    await user.click(getVersionButton)

    await waitFor(
      () => {
        expect(versionStatus.textContent).toBe("0.2.0")
      },
      { timeout: 3000 }
    )
  })
})
