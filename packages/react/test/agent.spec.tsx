import React from "react"
import { describe, it, expect } from "bun:test"
import { render, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  AgentProvider,
  createAgentContext,
  useAgent,
  useAgentManager,
} from "../dist"
import { LOCAL_HOST_NETWORK_URI } from "../src/utils"

const { AgentProvider: LocalAgentProvider, useAgent: useLocalAgent } =
  createAgentContext({
    withLocalEnv: true,
  })

describe("Agent Tests", () => {
  it("should handle agent switching and local environment", async () => {
    const user = userEvent.setup()

    const TestComponent = () => {
      const agent = useAgent()
      return (
        <div>
          <span data-testid="agent-status">{agent?.isLocal().toString()}</span>
        </div>
      )
    }

    const TestLocalComponent = () => {
      const agent = useLocalAgent()

      return (
        <div>
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
          <TestComponent />
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
    const localAgentStatus = container.querySelector(
      '[data-testid="local-agent-status"]'
    ) as HTMLElement
    const switchButton = container.querySelector(
      '[data-testid="switch-button"]'
    ) as HTMLElement

    expect(agentStatus.textContent).toBe("false")

    // Click the switch button
    await user.click(switchButton)

    // Wait for the agent to switch to local
    await waitFor(
      () => {
        expect(agentStatus.textContent).toBe("true")
      },
      { timeout: 2000 }
    )

    expect(localAgentStatus.textContent).toBe("true")
  })
})
