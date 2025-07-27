import React from "react"
import { describe, it, expect } from "bun:test"
import { render, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createReactor } from "../dist"
import { backend, idlFactory } from "./candid"
import { CreateReactorCoreParameters } from "../src/types"

const config: CreateReactorCoreParameters = {
  canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
  idlFactory,
  initializeOnCreate: false,
}

const { useQueryCall } = createReactor<typeof backend>(config)

describe("Query Tests", () => {
  it("should query on mount", async () => {
    const TestComponent = () => {
      const { data, loading } = useQueryCall({
        functionName: "version",
      })

      return (
        <div>
          <span data-testid="version-status">
            {loading ? "Loading..." : data ? data.toString() : "Ready To call"}
          </span>
        </div>
      )
    }

    const { container } = render(<TestComponent />)

    const versionStatus = container.querySelector(
      '[data-testid="version-status"]'
    ) as HTMLElement

    expect(versionStatus.textContent).toBe("Ready To call")

    await waitFor(
      () => {
        expect(versionStatus.textContent).toBe("0.2.0")
      },
      { timeout: 3000 }
    )
  })

  it("should have cached result", async () => {
    const TestComponent = () => {
      const { data, loading } = useQueryCall({
        functionName: "version",
      })

      return (
        <span data-testid="cached-version">
          {loading ? "Loading..." : data ? data.toString() : "Ready To call"}
        </span>
      )
    }

    const { container } = render(<TestComponent />)

    const versionStatus = container.querySelector(
      '[data-testid="cached-version"]'
    ) as HTMLElement

    // Should immediately have cached result
    expect(versionStatus.textContent).toBe("0.2.0")
  })

  it("should handle refetch and reset", async () => {
    const user = userEvent.setup()

    const TestComponent = () => {
      const { call, reset, data, loading } = useQueryCall({
        functionName: "version",
      })

      return (
        <div>
          <button data-testid="get-version-button" onClick={call}>
            Get Version
          </button>
          <button data-testid="reset-button" onClick={reset}>
            Reset
          </button>
          <span data-testid="refetch-version">
            {loading ? "Loading..." : data ? data.toString() : "Ready To call"}
          </span>
        </div>
      )
    }

    const { container } = render(<TestComponent />)

    const versionStatus = container.querySelector(
      '[data-testid="refetch-version"]'
    ) as HTMLElement
    const versionButton = container.querySelector(
      '[data-testid="get-version-button"]'
    ) as HTMLElement
    const resetButton = container.querySelector(
      '[data-testid="reset-button"]'
    ) as HTMLElement

    // Should have cached result
    expect(versionStatus.textContent).toBe("0.2.0")

    // Reset should clear the data
    await user.click(resetButton)

    expect(versionStatus.textContent).toBe("Ready To call")

    // Refetch should get the data again
    await user.click(versionButton)

    await waitFor(
      () => {
        expect(versionStatus.textContent).toBe("0.2.0")
      },
      { timeout: 3000 }
    )
  })
})
