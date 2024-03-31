import React from "react"
import fetchMock from "jest-fetch-mock"
import renderer, { act } from "react-test-renderer"
import {
  AgentProvider,
  createAgentContext,
  useAgent,
  useAgentManager,
} from "../src"
import { LOCAL_HOST_NETWORK_URI } from "../src/utils"

fetchMock.enableMocks()

fetchMock.mockResponse(async () => {
  return Promise.resolve({
    status: 200,
  })
})

const { AgentProvider: LocalAgentProvider, useAgent: useLocalAgent } =
  createAgentContext({
    withLocalEnv: true,
  })

describe("createReactor", () => {
  it("should query", async () => {
    const TestComponent = ({}) => {
      const agent = useAgent()
      return (
        <div>
          <span>{agent?.isLocal().toString()}</span>
        </div>
      )
    }

    const TestLocalComponent = ({}) => {
      const agent = useLocalAgent()

      return (
        <div>
          <span>{agent?.isLocal().toString()}</span>
        </div>
      )
    }

    const TestSwitchAgent = ({}) => {
      const agentManager = useAgentManager()

      const switchAgent = () =>
        agentManager.updateAgent({
          host: LOCAL_HOST_NETWORK_URI,
        })

      return (
        <div>
          <button onClick={switchAgent}>Switch</button>
        </div>
      )
    }

    let screen = renderer.create(
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

    const agentStatus = () =>
      screen.root.findAllByType("span")[0].props.children

    const localAgentStatus = () =>
      screen.root.findAllByType("span")[1].props.children

    const switchAgent = () =>
      screen.root.findAllByType("button")[0].props.onClick()

    expect(agentStatus()).toEqual("false")

    expect(screen.toJSON()).toMatchSnapshot()

    await act(async () => await switchAgent())

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1000))
    })

    expect(agentStatus()).toEqual("true")
    expect(localAgentStatus()).toEqual("true")

    expect(screen.toJSON()).toMatchSnapshot()
  })
})
