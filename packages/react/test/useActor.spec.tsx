import React, { createContext } from "react"
import renderer, { act } from "react-test-renderer"
import { backend, idlFactory } from "./candid"
import { AgentProvider, CandidAdapterProvider, useActor } from "../dist"
import { ActorHooksReturnType } from "../dist/types"
import { extractActorContext } from "../dist/helpers"

type Backend = typeof backend

describe("createReactor", () => {
  it("should query 1", async () => {
    const BackendActor = () => {
      const { hooks, fetchError, authenticating, fetching } = useActor<Backend>(
        {
          canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
          idlFactory,
        }
      )

      return fetching || authenticating ? (
        <p>Loading Candid interface...</p>
      ) : fetchError ? (
        <p>Error: {fetchError}</p>
      ) : (
        hooks && <TestComponent {...hooks} />
      )
    }

    const TestComponent = ({ useQueryCall }: ActorHooksReturnType<Backend>) => {
      const { data: version, loading } = useQueryCall({
        functionName: "version",
      })

      return (
        <div>
          <span>
            {loading
              ? "Loading..."
              : version
              ? version.toString()
              : "Ready To call"}
          </span>
        </div>
      )
    }

    let screen = renderer.create(
      <AgentProvider>
        <CandidAdapterProvider>
          <BackendActor />
        </CandidAdapterProvider>
      </AgentProvider>
    )

    const versionStatus = () => screen.root.findAllByType("span")[0]

    expect(screen.toJSON()).toMatchSnapshot()

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    expect(screen.toJSON()).toMatchSnapshot()

    expect(versionStatus().props.children).toEqual("Loading...")

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1000))
    })

    expect(versionStatus().props.children).toEqual("0.2.0")

    expect(screen.toJSON()).toMatchSnapshot()
  })

  it("should query 2", async () => {
    const ActorContext = createContext<ActorHooksReturnType<Backend> | null>(
      null
    )

    const { useQueryCall } = extractActorContext(ActorContext)

    const BackendActor = ({ children }: any) => {
      const { hooks, fetching, authenticating, fetchError } = useActor<Backend>(
        {
          canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
          idlFactory,
        }
      )

      return (
        <ActorContext.Provider value={hooks}>
          <h2>IC Canister Interaction</h2>
          {(fetching || authenticating) && <p>Loading Candid interface...</p>}
          {fetchError && <p>Error: {fetchError}</p>}
          {hooks && children}
        </ActorContext.Provider>
      )
    }
    // later in the code
    const CanisterName = () => {
      const { data: version, loading } = useQueryCall({
        functionName: "version",
      })

      return (
        <div>
          <span>
            {loading
              ? "Loading..."
              : version
              ? version.toString()
              : "Ready To call"}
          </span>
        </div>
      )
    }

    let screen = renderer.create(
      <AgentProvider withDevtools>
        <BackendActor>
          <CanisterName />
        </BackendActor>
      </AgentProvider>
    )

    const versionStatus = () => screen.root.findAllByType("span")[0]

    expect(screen.toJSON()).toMatchSnapshot()

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    expect(screen.toJSON()).toMatchSnapshot()

    expect(versionStatus().props.children).toEqual("Loading...")

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1000))
    })

    expect(versionStatus().props.children).toEqual("0.2.0")

    expect(screen.toJSON()).toMatchSnapshot()
  })
})
