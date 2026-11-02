// The interface tools that call a server function: what they send, what
// they refuse to send, and what they say when the server gives no result
// (StackBlitz, where TanStack Start's client resolves such a call with
// undefined). The server functions are mocked.
import type { AnySchema } from "@meantjs/schema"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  checkLiveCompatibility,
  generateModule,
  projectInterface,
} from "../../interface/functions.ts"
import type { CanisterInterface, MethodInfo } from "../../interface/types.ts"
import { CompatibilityTab } from "./CompatibilityTab.tsx"
import { ProjectTab } from "./ProjectTab.tsx"
import { TypeScriptTab } from "./TypeScriptTab.tsx"

vi.mock("../../interface/functions.ts", async () => {
  const { MAX_METHODS } = await import("../../interface/compile.ts")
  return {
    MAX_PROJECT_METHODS: MAX_METHODS,
    MAX_METHOD_NAME_LENGTH: 1024,
    projectInterface: vi.fn(),
    generateModule: vi.fn(),
    checkLiveCompatibility: vi.fn(),
    fetchInterface: vi.fn(),
  }
})

const NO_RESULT = /This tool runs on the studio's server/
const SOME_CANISTER = "qoctq-giaaa-aaaaa-aaaea-cai"
const LONG_NAME = "x".repeat(1025)

function method(name: string): MethodInfo {
  return { name, mode: "query", args: [], results: [] }
}

const DID_SHA256 = "ab".repeat(32)

function liveInterface(names: readonly string[]): CanisterInterface {
  const methods = names.map(method)
  const byName = new Map(methods.map((m) => [m.name, m]))
  return {
    canisterId: SOME_CANISTER,
    name: SOME_CANISTER,
    actor: {} as AnySchema,
    methods,
    method: (name) => byName.get(name),
    source: { kind: "metadata", certified: true, moduleHash: null },
    did: "service : {}",
    didSha256: DID_SHA256,
    omitted: [],
  }
}

beforeEach(() => {
  vi.mocked(projectInterface).mockReset()
  vi.mocked(generateModule).mockReset()
  vi.mocked(checkLiveCompatibility).mockReset()
})

afterEach(cleanup)

describe("ProjectTab", () => {
  it("refuses a method name the server function would refuse, and says why", () => {
    render(<ProjectTab iface={liveInterface(["greet", LONG_NAME])} />)
    fireEvent.click(
      screen.getByRole("checkbox", { name: new RegExp(LONG_NAME) })
    )
    const button = screen.getByRole("button", { name: /Project 1 method/ })
    expect(button.getAttribute("aria-disabled")).toBe("true")
    const why = document.getElementById(
      button.getAttribute("aria-describedby") ?? ""
    )
    expect(why?.textContent).toMatch(/method names of at most 1,024 characters/)
    fireEvent.click(button)
    expect(projectInterface).not.toHaveBeenCalled()
  })

  it("keeps the focus on Project while it runs, and runs it once", async () => {
    type Answer = Awaited<ReturnType<typeof projectInterface>>
    let answer: (value: Answer) => void = () => undefined
    vi.mocked(projectInterface).mockReturnValue(
      new Promise<Answer>((resolve) => {
        answer = resolve
      })
    )
    render(<ProjectTab iface={liveInterface(["greet", "count"])} />)
    fireEvent.click(screen.getByRole("checkbox", { name: /greet/ }))
    const button = screen.getByRole("button", { name: /Project 1 method/ })
    button.focus()
    fireEvent.click(button)
    const running = await screen.findByRole("button", { name: "Projecting…" })
    // The same element, never disabled: a disabled one drops the focus.
    expect(running).toBe(button)
    expect((running as HTMLButtonElement).disabled).toBe(false)
    expect(running.getAttribute("aria-disabled")).toBe("true")
    expect(document.activeElement).toBe(running)
    fireEvent.click(running)
    expect(projectInterface).toHaveBeenCalledTimes(1)
    answer({ ok: true, did: "service : {}", methods: ["greet"] })
    await screen.findByRole("button", { name: /Project 1 method/ })
  })

  it("names each method whole, where the picker cuts it short", () => {
    const names = [
      "get_account_identifier_balance",
      "get_account_identifier_transactions",
    ]
    render(<ProjectTab iface={liveInterface(names)} />)
    for (const name of names) expect(screen.getByTitle(name)).toBeTruthy()
  })

  it("says the tool needs the studio's server when the call gives no result", async () => {
    vi.mocked(projectInterface).mockResolvedValue(
      undefined as unknown as Awaited<ReturnType<typeof projectInterface>>
    )
    render(<ProjectTab iface={liveInterface(["greet", "count"])} />)
    fireEvent.click(screen.getByRole("checkbox", { name: /greet/ }))
    fireEvent.click(screen.getByRole("button", { name: /Project 1 method/ }))
    expect(await screen.findByText(NO_RESULT)).toBeTruthy()
    expect(projectInterface).toHaveBeenCalledWith({
      data: {
        canisterId: SOME_CANISTER,
        didSha256: DID_SHA256,
        methods: ["greet"],
      },
    })
    expect(screen.queryByText(/reading 'ok'/)).toBeNull()
  })
})

describe("TypeScriptTab", () => {
  it("says the module needs the studio's server when the call gives no result", async () => {
    vi.mocked(generateModule).mockResolvedValue(
      undefined as unknown as Awaited<ReturnType<typeof generateModule>>
    )
    render(<TypeScriptTab iface={liveInterface(["greet"])} />)
    expect(await screen.findByText(NO_RESULT)).toBeTruthy()
  })
})

describe("CompatibilityTab", () => {
  it("says the committed check needs the studio's server when the call gives no result", async () => {
    vi.mocked(checkLiveCompatibility).mockResolvedValue(
      undefined as unknown as Awaited<ReturnType<typeof checkLiveCompatibility>>
    )
    const { registryEntry } = await import("../../lib/registry.ts")
    const registry = registryEntry("ryjl3-tyaaa-aaaaa-aaaba-cai")
    if (registry === undefined) throw new Error("no ICP ledger entry")
    const iface: CanisterInterface = {
      ...liveInterface(["icrc1_fee"]),
      canisterId: registry.id,
      source: { kind: "typed", module: registry.module },
      registry,
    }
    render(<CompatibilityTab iface={iface} />)
    fireEvent.click(
      screen.getByRole("button", { name: "Check against mainnet" })
    )
    await waitFor(() => expect(screen.getByText(NO_RESULT)).toBeTruthy())
  })
})
