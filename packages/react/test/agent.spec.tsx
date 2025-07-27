import React from "react"
import { describe, it, expect } from "bun:test"
import { render } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  AgentProvider,
  createAgentContext,
  useAgent,
  useAgentManager,
} from "../dist"
import { LOCAL_HOST_NETWORK_URI } from "../src/utils"
import { IDL } from "@dfinity/candid"
import { beforeEach } from "bun:test"
import { spyOn } from "bun:test"
import { Cbor } from "@dfinity/agent"
import { afterEach } from "bun:test"
import { mock } from "bun:test"

// --- Mocking Fetch Correctly ---
const canisterDecodedReturnValue = "Hello, World!"
const expectedReplyArg = IDL.encode([IDL.Text], [canisterDecodedReturnValue])

// Set up the spy before each test
beforeEach(() => {
  spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString()

        if (url.endsWith("/call")) {
          return new Response(null, { status: 200 })
        }

        if (url.includes("/query")) {
          const responseObj = {
            status: "replied",
            reply: {
              arg: expectedReplyArg,
            },
          }
          return new Response(Cbor.encode(responseObj))
        }

        // For other requests, return empty success response
        return new Response(JSON.stringify({}), { status: 200 })
      },
      { preconnect: () => {} } // Mock the preconnect property
    )
  )
})

// Restore the original fetch after each test
afterEach(() => {
  // This is crucial to prevent tests from interfering with each other
  mock.restore()
})

const { AgentProvider: LocalAgentProvider, useAgent: useLocalAgent } =
  createAgentContext({
    withLocalEnv: true,
    initializeOnCreate: false,
  })

describe("Agent Tests", () => {
  it("should handle agent switching and local environment", async () => {
    const user = userEvent.setup()

    const TestSwitchComponent = () => {
      const agent = useAgent()
      return (
        <div>
          <span data-testid="agent-network">{agent?.host.origin}</span>
          <span data-testid="agent-status">{agent?.isLocal().toString()}</span>
        </div>
      )
    }

    const TestLocalComponent = () => {
      const agent = useLocalAgent()

      return (
        <div>
          <span data-testid="local-agent-network">{agent?.host.origin}</span>
          <span data-testid="local-agent-status">
            {agent?.isLocal().toString()}
          </span>
        </div>
      )
    }

    const TestSwitchAgent = () => {
      const agentManager = useAgentManager()

      const switchAgent = () =>
        agentManager.updateAgent({
          host: LOCAL_HOST_NETWORK_URI,
        })

      return (
        <div>
          <button data-testid="switch-button" onClick={switchAgent}>
            Switch
          </button>
        </div>
      )
    }

    const { container } = render(
      <>
        <AgentProvider withProcessEnv>
          <TestSwitchComponent />
          <TestSwitchAgent />
        </AgentProvider>
        <LocalAgentProvider>
          <TestLocalComponent />
        </LocalAgentProvider>
      </>
    )

    // Check initial agent status
    const agentStatus = container.querySelector(
      '[data-testid="agent-status"]'
    ) as HTMLElement
    const agentNetwork = container.querySelector(
      '[data-testid="agent-network"]'
    ) as HTMLElement
    const localAgentNetwork = container.querySelector(
      '[data-testid="local-agent-network"]'
    ) as HTMLElement
    const localAgentStatus = container.querySelector(
      '[data-testid="local-agent-status"]'
    ) as HTMLElement
    const switchButton = container.querySelector(
      '[data-testid="switch-button"]'
    ) as HTMLElement

    expect(agentStatus.textContent).toBe("false")
    expect(agentNetwork.textContent).toBe("https://ic0.app")

    expect(localAgentNetwork.textContent).toBe(LOCAL_HOST_NETWORK_URI)
    expect(localAgentStatus.textContent).toBe("true")

    // Click the switch button
    await user.click(switchButton)

    // Wait for the agent to switch to local
    expect(agentStatus.textContent).toBe("true")
    expect(agentNetwork.textContent).toBe(LOCAL_HOST_NETWORK_URI)

    // Check if the local agent is still local
    expect(localAgentNetwork.textContent).toBe(LOCAL_HOST_NETWORK_URI)
    expect(localAgentStatus.textContent).toBe("true")
  })
})
