// @vitest-environment jsdom
//
// Scenario 9: "My balances" asks nothing while nobody is signed in, reads
// the user's own balances as the user after a sign-in, and starts from empty
// keys after a switch of account, so one account's balance is never shown
// for another.
import { ReactorProvider } from "@ic-reactor/react"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { tokens } from "@/format"
import { LEDGERS } from "@/ledgers"
import {
  BALANCES,
  mockLedgers,
  requestsFor,
  SEED_1,
  SEED_2,
  type MockLedgers,
} from "@/testing/mock-ledgers"
import { MyBalances } from "./MyBalances"

const ICP = LEDGERS[0]!
let test: MockLedgers
afterEach(() => {
  cleanup()
  test.client.dispose()
})

function renderSection() {
  test = mockLedgers()
  return render(
    <ReactorProvider client={() => test.client}>
      <MyBalances ledgers={LEDGERS} />
    </ReactorProvider>
  )
}

const icpRow = (container: HTMLElement) =>
  container.querySelector(`[data-ledger="${ICP.id}"] [data-field="balance"]`)
    ?.textContent
const icp = (units: bigint) => tokens(units, 8, "ICP")

describe("My balances", () => {
  it("prompts to sign in and reads nothing while signed out", async () => {
    renderSection()

    expect(
      screen.getByRole("button", { name: "Sign in with Internet Identity" })
    ).toBeTruthy()
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(requestsFor(test, "icrc1_balance_of")).toEqual([])
  })

  it("reads the user's balances as the user after a sign-in", async () => {
    const { container } = renderSection()

    fireEvent.click(
      screen.getByRole("button", { name: "Sign in with Internet Identity" })
    )

    await waitFor(() =>
      expect(icpRow(container)).toBe(icp(BALANCES.get(SEED_1) ?? 0n))
    )
    expect(
      requestsFor(test, "icrc1_balance_of").map(({ caller }) => caller)
    ).toEqual(LEDGERS.map(() => SEED_1))
  })

  it("starts from empty keys after a switch: never one account's balance for another", async () => {
    const { container } = renderSection()
    fireEvent.click(
      screen.getByRole("button", { name: "Sign in with Internet Identity" })
    )
    await waitFor(() =>
      expect(icpRow(container)).toBe(icp(BALANCES.get(SEED_1) ?? 0n))
    )

    act(() => {
      test.auth.switchTo(2)
    })

    // The first render as seed 2 has nothing for seed 2 yet.
    expect(icpRow(container)).toBe("loading")
    await waitFor(() =>
      expect(icpRow(container)).toBe(icp(BALANCES.get(SEED_2) ?? 0n))
    )
    expect(
      requestsFor(test, "icrc1_balance_of")
        .slice(LEDGERS.length)
        .map(({ caller }) => caller)
    ).toEqual(LEDGERS.map(() => SEED_2))
  })

  it("prompts again after a sign-out", async () => {
    const { container } = renderSection()
    fireEvent.click(
      screen.getByRole("button", { name: "Sign in with Internet Identity" })
    )
    await waitFor(() => expect(icpRow(container)).toBeDefined())

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }))

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Sign in with Internet Identity" })
      ).toBeTruthy()
    )
    expect(icpRow(container)).toBeUndefined()
  })
})
