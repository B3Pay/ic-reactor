import React from "react"
import fetchMock from "jest-fetch-mock"
import renderer from "react-test-renderer"
import { AgentProvider, createAgentContext, useAgent } from "../src"

fetchMock.enableMocks()

fetchMock.mockResponse(async () => {
  return Promise.resolve({
    status: 200,
  })
})

const {
  AgentProvider: LocalAgentProvider,
  useAuthClient: useLocalAuthClient,
  useUserPrincipal: useLocalUserPrincipal,
  useAgent: useLocalAgent,
} = createAgentContext({
  isLocalEnv: true,
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

    let screen = renderer.create(
      <>
        <AgentProvider>
          <TestComponent />
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

    expect(agentStatus()).toEqual("false")
    expect(localAgentStatus()).toEqual("true")

    expect(screen.toJSON()).toMatchSnapshot()
  })
})
