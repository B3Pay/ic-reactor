// @vitest-environment jsdom
//
// Scenario 9: "My balances" asks nothing while nobody is signed in, reads
// the user's own balances as the user after a sign-in, and starts from empty
// keys after a switch of account, so one account's balance is never shown
// for another. A row whose decimals or symbol read fails shows that failure.
import type { TestHandlers } from "@ic-reactor/core/testing"
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
import { actor, type Actor } from "@/canisters/icrc1"
import { tokens } from "@/format"
import { LEDGERS, type LedgerRef } from "@/ledgers"
import {
  BALANCES,
  ledgerHandlers,
  mockLedgers,
  requestsFor,
  SEED_1,
  SEED_2,
  tokenOf,
  type MockLedgers,
} from "@/testing/mock-ledgers"
import { MyBalances } from "./MyBalances"

const ICP = LEDGERS[0]!
let test: MockLedgers
afterEach(() => {
  cleanup()
  test.client.dispose()
})

/** @param prepare - Mocks what this test changes, before anything is read. */
function renderSection(prepare?: (mocked: MockLedgers) => void) {
  test = mockLedgers()
  prepare?.(test)
  return render(
    <ReactorProvider client={() => test.client}>
      <MyBalances ledgers={LEDGERS} />
    </ReactorProvider>
  )
}

const row = (container: HTMLElement, ledger: LedgerRef) =>
  container.querySelector(`[data-ledger="${ledger.id}"] [data-field="balance"]`)
    ?.textContent
const icpRow = (container: HTMLElement) => row(container, ICP)
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

  // The balance is read, but the row cannot show it without the ledger's
  // decimals and symbol: when one of those reads fails, the row shows that
  // failure's kind, as for a failed balance, and not "loading" for good.
  it.each([
    {
      method: "icrc1_decimals",
      // A handler that throws traps the call: reject code 5.
      handlers: (): TestHandlers<Actor> => ({
        icrc1_decimals: () => {
          throw new Error("decimals trapped")
        },
      }),
    },
    {
      method: "icrc1_symbol",
      handlers: (mocked: MockLedgers): TestHandlers<Actor> => ({
        icrc1_symbol: () => mocked.reject(4, "no symbol here"),
      }),
    },
  ])(
    "shows the kind of a failed $method read, not loading, though the balance was read",
    async ({ method, handlers }) => {
      const { container } = renderSection((mocked) =>
        mocked.mock<Actor>(actor, ICP.id, {
          ...ledgerHandlers(tokenOf(ICP)),
          ...handlers(mocked),
        })
      )

      fireEvent.click(
        screen.getByRole("button", { name: "Sign in with Internet Identity" })
      )

      await waitFor(() => expect(icpRow(container)).toBe("rejected"))
      // The balance read itself succeeded and is in the cache; the failure
      // is the other read's, asked once (a trap or a reject is not retried).
      const { client } = test
      const ledger = client.canister<Actor>(actor, { id: ICP.id })
      const balance = client.queryOptions(ledger, "icrc1_balance_of", {
        owner: SEED_1,
        subaccount: null,
      })
      expect(client.queryClient.getQueryData(balance.queryKey)).toBe(
        BALANCES.get(SEED_1)
      )
      expect(
        requestsFor(test, method).filter(
          ({ canisterId }) => canisterId === ICP.id
        )
      ).toHaveLength(1)
      // The other ledgers answer as usual.
      await waitFor(() => {
        for (const other of LEDGERS.slice(1)) {
          const token = tokenOf(other)
          expect(row(container, other)).toBe(
            tokens(BALANCES.get(SEED_1) ?? 0n, token.decimals, token.symbol)
          )
        }
      })
    }
  )

  it("starts from empty keys after a switch: never one account's balance for another", async () => {
    const { container } = renderSection()
    fireEvent.click(
      screen.getByRole("button", { name: "Sign in with Internet Identity" })
    )
    await waitFor(() =>
      expect(icpRow(container)).toBe(icp(BALANCES.get(SEED_1) ?? 0n))
    )
    // From now on the ICP ledger holds every balance read until released,
    // while it answers decimals and symbol at once.
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    test.mock<Actor>(actor, ICP.id, {
      ...ledgerHandlers(tokenOf(ICP)),
      icrc1_balance_of: async ({ owner }) => {
        await held
        return BALANCES.get(owner) ?? 0n
      },
    })

    act(() => {
      test.auth.switchTo(2)
    })

    // Seed 2's decimals and symbol arrive; seed 2's balance does not. The
    // row has nothing to show for seed 2, and shows nothing of seed 1's.
    await waitFor(() =>
      expect(
        requestsFor(test, "icrc1_symbol").filter(
          ({ caller, canisterId }) => caller === SEED_2 && canisterId === ICP.id
        )
      ).toHaveLength(1)
    )
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(icpRow(container)).toBe("loading")

    release()
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
