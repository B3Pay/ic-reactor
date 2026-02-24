import React from "react"
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react"
import { idlFactory, hello_actor } from "../declarations/hello_actor"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { createActorHooks } from "@ic-reactor/react"
import { describe, it, expect, afterEach, beforeAll } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
})

const clientManager = new ClientManager({
  withProcessEnv: true,
  agentOptions: {
    verifyQuerySignatures: false,
  },
  queryClient,
})

const helloActor = new Reactor<typeof hello_actor>({
  clientManager,
  canisterId: process.env.CANISTER_ID_HELLO_ACTOR!,
  idlFactory,
  name: "hello_actor",
})

const { useActorQuery, useActorMutation } = createActorHooks(helloActor)

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

beforeAll(async () => {
  await clientManager.initialize()
})

afterEach(() => {
  queryClient.clear()
  cleanup()
})

describe("React Test", () => {
  it("should initialize and render", () => {
    const { container } = render(<div>Test App</div>, { wrapper: Wrapper })
    expect(container).toBeInTheDocument()
  })

  it("should call query method", async () => {
    const HelloComponent = () => {
      const { refetch, data, isLoading, isError, error } = useActorQuery({
        functionName: "greet",
        args: ["Query Call"],
        enabled: false, // Wait for manual call
      })

      if (isError) return <div>Error: {error.message}</div>

      return (
        <div>
          <button onClick={() => refetch()}>Say Hello</button>
          <span data-testid="data">
            {isLoading
              ? "Loading..."
              : data
                ? data.toString()
                : "Ready To call"}
          </span>
        </div>
      )
    }

    render(<HelloComponent />, { wrapper: Wrapper })

    expect(screen.getByTestId("data")).toHaveTextContent("Ready To call")

    await act(async () => {
      fireEvent.click(screen.getByText("Say Hello"))
    })

    expect(
      await screen.findByText("Hello, Query Call!", undefined, {
        timeout: 10000,
      })
    ).toBeInTheDocument()
  }, 15000)

  it("should call update method", async () => {
    const HelloComponent = () => {
      const { mutateAsync, data, isPending, isError, error } = useActorMutation(
        {
          functionName: "greet_update",
        }
      )

      if (isError) return <div>Error: {error.message}</div>

      return (
        <div>
          <button
            onClick={() =>
              mutateAsync(["Update Call"]).catch((e) =>
                console.error("Update failed", e)
              )
            }
          >
            Say Hello
          </button>
          <span data-testid="data">
            {isPending
              ? "Loading..."
              : data
                ? data.toString()
                : "Ready To call"}
          </span>
        </div>
      )
    }

    render(<HelloComponent />, { wrapper: Wrapper })

    expect(screen.getByTestId("data")).toHaveTextContent("Ready To call")

    await act(async () => {
      fireEvent.click(screen.getByText("Say Hello"))
    })

    expect(
      await screen.findByText("Hello, Update Call!", undefined, {
        timeout: 10000,
      })
    ).toBeInTheDocument()
  }, 15000)
})
