import { describe, it, expect } from "vitest"
import { ClientManager, Reactor, DisplayReactor } from "@ic-reactor/core"
import { QueryClient } from "@tanstack/react-query"
import { defineReactor } from "./defineReactor"
import { AuthenticationManager } from "./auth/authentication-manager"
import { IdentityAttributesManager } from "./auth/identity-attributes-manager"
import { ActorMethod } from "@icp-sdk/core/agent"

const idlFactory = ({ IDL }: any) =>
  IDL.Service({
    greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]),
  })

interface TestActor {
  greet: ActorMethod<[string], string>
}

const baseConfig = {
  name: "test",
  idlFactory,
  canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
}

describe("defineReactor", () => {
  it("bootstraps a standard Reactor with hooks and infrastructure", () => {
    const result = defineReactor<TestActor>(baseConfig)

    expect(result.reactor).toBeInstanceOf(Reactor)
    expect(result.reactor).not.toBeInstanceOf(DisplayReactor)
    expect(result.clientManager).toBeInstanceOf(ClientManager)
    expect(result.queryClient).toBeInstanceOf(QueryClient)
    expect(typeof result.useActorQuery).toBe("function")
    expect(typeof result.useActorMutation).toBe("function")
  })

  it("creates a DisplayReactor when display is true", () => {
    const result = defineReactor<TestActor>({ ...baseConfig, display: true })

    expect(result.reactor).toBeInstanceOf(DisplayReactor)
  })

  it("wires the reactor to the created ClientManager and QueryClient", () => {
    const { reactor, clientManager, queryClient } =
      defineReactor<TestActor>(baseConfig)

    expect(reactor.clientManager).toBe(clientManager)
    expect(clientManager.queryClient).toBe(queryClient)
  })

  it("reuses an existing ClientManager and its QueryClient", () => {
    const queryClient = new QueryClient()
    const clientManager = new ClientManager({ queryClient })

    const result = defineReactor<TestActor>({ ...baseConfig, clientManager })

    expect(result.clientManager).toBe(clientManager)
    expect(result.queryClient).toBe(queryClient)
    expect(result.reactor.clientManager).toBe(clientManager)
  })

  it("lets multiple reactors share one ClientManager", () => {
    const ledger = defineReactor<TestActor>({ ...baseConfig, name: "ledger" })
    const index = defineReactor<TestActor>({
      ...baseConfig,
      name: "index",
      clientManager: ledger.clientManager,
    })

    expect(index.clientManager).toBe(ledger.clientManager)
    expect(index.reactor).not.toBe(ledger.reactor)
  })

  it("does not construct the auth manager until auth is used", () => {
    const result = defineReactor<TestActor>(baseConfig)

    // Constructing AuthenticationManager dynamically imports the optional
    // @icp-sdk/auth peer; reactors that never use auth must not trigger it.
    expect(
      Object.getOwnPropertyDescriptor(result, "authentication")?.get
    ).toBeTypeOf("function")
    expect(result.authentication).toBeInstanceOf(AuthenticationManager)
    // Same instance on repeat access.
    expect(result.authentication).toBe(result.authentication)
  })

  it("bootstraps Internet Identity alongside the actor hooks", () => {
    const result = defineReactor<TestActor>(baseConfig)

    expect(result.authentication).toBeInstanceOf(AuthenticationManager)
    expect(result.identityAttributes).toBeInstanceOf(IdentityAttributesManager)
    expect(result.authentication.clientManager).toBe(result.clientManager)
    expect(typeof result.useAuth).toBe("function")
    expect(typeof result.useUserPrincipal).toBe("function")
    expect(typeof result.useAgentState).toBe("function")
    expect(typeof result.useIdentityAttributes).toBe("function")
  })

  it("forwards auth options to the AuthenticationManager", async () => {
    const { authentication } = defineReactor<TestActor>({
      ...baseConfig,
      auth: { identityProvider: "https://identity.example.com/authorize" },
    })

    // Exposed through the client the manager would build.
    expect(
      (
        authentication as unknown as {
          resolveClientOptions: (o?: unknown) => { identityProvider: string }
        }
      ).resolveClientOptions().identityProvider
    ).toBe("https://identity.example.com/authorize")
  })

  it("lets multiple reactors share one Internet Identity session", () => {
    const ledger = defineReactor<TestActor>({ ...baseConfig, name: "ledger" })
    const index = defineReactor<TestActor>({
      ...baseConfig,
      name: "index",
      clientManager: ledger.clientManager,
      authentication: ledger.authentication,
    })

    expect(index.authentication).toBe(ledger.authentication)
  })

  it("adopts the ClientManager of a shared authentication manager", () => {
    const ledger = defineReactor<TestActor>({ ...baseConfig, name: "ledger" })

    // `authentication` without `clientManager`: the reactor must not get an
    // agent the auth manager never updates, or sign-in would leave this
    // reactor's calls anonymous.
    const index = defineReactor<TestActor>({
      ...baseConfig,
      name: "index",
      authentication: ledger.authentication,
    })

    expect(index.clientManager).toBe(ledger.clientManager)
    expect(index.queryClient).toBe(ledger.queryClient)
    expect(index.reactor.clientManager).toBe(
      ledger.authentication.clientManager
    )
  })

  it("reports the QueryClient the ClientManager actually uses", () => {
    const managerQueryClient = new QueryClient()
    const clientManager = new ClientManager({ queryClient: managerQueryClient })

    // Queries run against clientManager.queryClient, so returning the stray
    // one passed alongside it would hand back a cache nothing writes to.
    const result = defineReactor<TestActor>({
      ...baseConfig,
      clientManager,
      queryClient: new QueryClient(),
    })

    expect(result.queryClient).toBe(managerQueryClient)
    expect(result.queryClient).toBe(result.clientManager.queryClient)
  })

  it("rejects an authentication manager bound to a different ClientManager", () => {
    const ledger = defineReactor<TestActor>({ ...baseConfig, name: "ledger" })
    const other = new ClientManager({ queryClient: new QueryClient() })

    // Silently splitting them would make sign-in update one agent while the
    // reactor calls through another.
    expect(() =>
      defineReactor<TestActor>({
        ...baseConfig,
        name: "index",
        clientManager: other,
        authentication: ledger.authentication,
      })
    ).toThrow(/clientManager/i)
  })

  it("rejects auth options passed alongside an existing authentication manager", () => {
    const ledger = defineReactor<TestActor>({ ...baseConfig, name: "ledger" })

    // The shared manager is already built, so `auth` could only be dropped —
    // silently losing e.g. derivationOrigin would change the user's principal.
    expect(() =>
      defineReactor<TestActor>({
        ...baseConfig,
        name: "index",
        authentication: ledger.authentication,
        auth: { derivationOrigin: "https://app.example.com" },
      })
    ).toThrow(/derivationOrigin/)
  })
})
