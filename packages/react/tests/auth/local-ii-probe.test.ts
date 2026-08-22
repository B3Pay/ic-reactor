/**
 * The three Internet Identity eras from the bisect in #334, and what the probe
 * has to conclude for each.
 *
 * The failure this replaces is silent: the popup renders the gateway's
 * "Response Verification Error" page and the app waits until the user closes
 * it, with nothing naming the cause.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const agentMocks = vi.hoisted(() => ({ createActor: vi.fn() }))

vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: agentMocks.createActor },
}))

import {
  probeLocalInternetIdentity,
  localInternetIdentityUnavailableError,
} from "../../src/auth/local-ii-probe.js"

const CANISTER_ID = "rdmx6-jaaaa-aaaaa-aaadq-cai"

/** An asset canister answering `http_request` with the given per-URL statuses. */
function canisterServing(statuses: Record<string, number>) {
  const http_request = vi.fn(async ({ url }: { url: string }) => {
    const status = statuses[url]
    if (status === undefined) return { status_code: 404 }
    return { status_code: status }
  })
  agentMocks.createActor.mockReturnValue({ http_request })
  return http_request
}

/** A canister that does not answer `http_request` at all. */
function canisterUnreachable() {
  agentMocks.createActor.mockReturnValue({
    http_request: vi.fn(async () => {
      throw new Error("canister not found")
    }),
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const agent = {} as any

beforeEach(() => {
  agentMocks.createActor.mockReset()
})

describe("probeLocalInternetIdentity", () => {
  it("uses /authorize when the build serves it (release-2026-01-05 … -03-16)", async () => {
    canisterServing({ "/authorize": 200 })

    await expect(
      probeLocalInternetIdentity(agent, CANISTER_ID)
    ).resolves.toEqual({ path: "/authorize", inconclusive: false })
  })

  it("falls back to #authorize for pre-2026 builds that serve the SPA at /", async () => {
    // `/authorize` is not an asset in that era; the flow runs off a fragment,
    // which the gateway never sees.
    const http_request = canisterServing({ "/authorize": 404, "/": 200 })

    await expect(
      probeLocalInternetIdentity(agent, CANISTER_ID)
    ).resolves.toEqual({ path: "/#authorize", inconclusive: false })
    expect(http_request).toHaveBeenCalledTimes(2)
  })

  it("reports no sign-in UI for frontend-less builds (release-2026-03-23 onward)", async () => {
    // The id.ai split moved the frontend out of the canister entirely.
    canisterServing({ "/authorize": 404, "/": 404 })

    await expect(
      probeLocalInternetIdentity(agent, CANISTER_ID)
    ).resolves.toEqual({ path: null, inconclusive: false })
  })

  it("stays inconclusive when the canister cannot be reached", async () => {
    // A replica that is down, or a canister that is not an asset canister, must
    // not turn into a hard login failure — the setup may be fine and merely
    // unreachable from here.
    canisterUnreachable()

    await expect(
      probeLocalInternetIdentity(agent, CANISTER_ID)
    ).resolves.toEqual({ path: "/authorize", inconclusive: true })
  })

  it("stays inconclusive when the actor cannot even be built", async () => {
    agentMocks.createActor.mockImplementation(() => {
      throw new Error("bad canister id")
    })

    await expect(
      probeLocalInternetIdentity(agent, CANISTER_ID)
    ).resolves.toEqual({ path: "/authorize", inconclusive: true })
  })

  it("treats any 2xx as served", async () => {
    canisterServing({ "/authorize": 204 })

    await expect(
      probeLocalInternetIdentity(agent, CANISTER_ID)
    ).resolves.toEqual({ path: "/authorize", inconclusive: false })
  })

  it("never throws", async () => {
    canisterUnreachable()
    await expect(
      probeLocalInternetIdentity(agent, CANISTER_ID)
    ).resolves.toBeDefined()
  })
})

describe("localInternetIdentityUnavailableError", () => {
  it("names the canister and the release that still works", () => {
    const error = localInternetIdentityUnavailableError(CANISTER_ID)

    expect(error.message).toContain(CANISTER_ID)
    expect(error.message).toContain("release-2026-03-16")
    // The whole point is that the user learns why, not just that it failed.
    expect(error.message).toContain("id.ai split")
  })
})
