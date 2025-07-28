import React from "react"
import { describe, it, expect } from "bun:test"
import { render, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  AgentProvider,
  CandidAdapterProvider,
  createActorContext,
} from "../dist"

const { ActorProvider, useQueryCall } = createActorContext({
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
})

describe("Context Tests", () => {
  it("should handle query calls", async () => {
    const user = userEvent.setup()

    const TestComponent = () => {
      const {
        call,
        data: version,
        loading,
      } = useQueryCall({ functionName: "icrc1_name", refetchOnMount: false })

      return (
        <div>
          <button data-testid="get-version-button" onClick={call}>
            Get Version
          </button>
          <span data-testid="status">
            {loading
              ? "Loading..."
              : version
              ? version.toString()
              : "Ready To call"}
          </span>
        </div>
      )
    }

    const { container } = render(
      <AgentProvider>
        <CandidAdapterProvider>
          <ActorProvider>
            <TestComponent />
          </ActorProvider>
        </CandidAdapterProvider>
      </AgentProvider>
    )

    const statusElement = container.querySelector(
      '[data-testid="status"]'
    ) as HTMLElement
    const getVersionButton = container.querySelector(
      '[data-testid="get-version-button"]'
    ) as HTMLElement

    // Wait for initial load
    await waitFor(
      () => {
        expect(statusElement.textContent).toBe("Ready To call")
      },
      { timeout: 3000 }
    )

    // Click the button to make the call
    await user.click(getVersionButton)

    // Wait for the response
    await waitFor(
      () => {
        expect(statusElement.textContent).toBe("Internet Computer")
      },
      { timeout: 3000 }
    )
  })
})
