// Scenario 7: optimistic adds and removes, rolled back on a refusal or a
// failure, with the client's own invalidation still run after each one.
import { principal } from "@candid-core/schema"
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { AddressBook } from "./AddressBook.tsx"
import {
  BOB,
  clearEnvCookie,
  createTestWallet,
  patiently,
  renderWithWallet,
  SEED_1,
  SEED_2,
  type TestWallet,
} from "./test/test-wallet.tsx"

let wallet: TestWallet | undefined
afterEach(() => {
  cleanup()
  wallet?.client.dispose()
  clearEnvCookie()
})

/** Seed 1's address book holds Bob. */
async function renderBook(): Promise<TestWallet> {
  const made = createTestWallet()
  made.addContact(SEED_1, { name: "Bob", owner: principal(BOB) })
  wallet = made
  renderWithWallet(made, <AddressBook />)
  await screen.findByText("Bob", {}, patiently)
  return made
}

/** The names the list shows, in order. */
const names = () =>
  within(screen.getByRole("list", { name: "Contacts" }))
    .queryAllByRole("listitem")
    .map((item) => item.querySelector("strong")?.textContent)

function add(name: string, owner: string) {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } })
  fireEvent.change(screen.getByLabelText("Principal"), {
    target: { value: owner },
  })
  fireEvent.click(screen.getByRole("button", { name: "Add contact" }))
}

describe("the address book", () => {
  it("shows an added contact before the backend answers, then reads the list again", async () => {
    const made = await renderBook()
    const release = made.holdNext("add_contact")
    const reads = made.callsOf("contacts")

    add("Carol", SEED_2)

    // The backend holds the call: the list already shows Carol.
    await waitFor(() => expect(names()).toEqual(["Bob", "Carol"]))
    expect(screen.getByText("saving…")).toBeTruthy()
    expect(made.contactsOf(SEED_1).map((c) => c.name)).toEqual(["Bob"])

    release()

    await waitFor(
      () => expect(screen.queryByText("saving…")).toBeNull(),
      patiently
    )
    expect(names()).toEqual(["Bob", "Carol"])
    // The client's onSettled ran: it invalidated the list, which was read again.
    expect(made.callsOf("contacts")).toBeGreaterThan(reads)
  })

  it("rolls an add back when the backend refuses it (canister_err), and says why", async () => {
    const made = await renderBook()
    const release = made.holdNext("add_contact")
    const reads = made.callsOf("contacts")

    add("bob", SEED_2)
    await waitFor(() => expect(names()).toEqual(["Bob", "bob"]))
    // The re-read the client asks for after the refusal is held, so what
    // the list shows next comes from the rollback alone.
    const releaseReread = made.holdNext("contacts")
    release()

    await waitFor(() => expect(names()).toEqual(["Bob"]), patiently)
    releaseReread()
    await screen.findByText(
      'Refused by the canister: "bob" is in the address book already. The list is back as it was.',
      {},
      patiently
    )
    expect(names()).toEqual(["Bob"])
    // A canister_err still invalidates: the backend may have changed state first.
    expect(made.callsOf("contacts")).toBeGreaterThan(reads)
  })

  it("rolls an add back when the call traps, says the outcome is unknown, and reads the list again", async () => {
    const made = await renderBook()
    const release = made.holdNext("add_contact")
    const reads = made.callsOf("contacts")
    made.failNext("add_contact", "trap")

    add("Carol", SEED_2)
    await waitFor(() => expect(names()).toEqual(["Bob", "Carol"]))
    const releaseReread = made.holdNext("contacts")
    release()

    await waitFor(() => expect(names()).toEqual(["Bob"]), patiently)
    releaseReread()
    await screen.findByText(/^Outcome unknown \(rejected\)/, {}, patiently)
    expect(names()).toEqual(["Bob"])
    expect(made.callsOf("contacts")).toBeGreaterThan(reads)
    expect(made.contactsOf(SEED_1).map((c) => c.name)).toEqual(["Bob"])
  })

  it("removes a contact at once, and keeps it removed once the backend agrees", async () => {
    const made = await renderBook()
    const release = made.holdNext("remove_contact")

    fireEvent.click(screen.getByRole("button", { name: "Remove Bob" }))

    await screen.findByTestId("no-contacts")
    release()
    await waitFor(() => expect(made.contactsOf(SEED_1)).toEqual([]), patiently)
    await waitFor(() => expect(made.callsOf("remove_contact")).toBe(1))
    expect(screen.getByTestId("no-contacts")).toBeTruthy()
  })

  it("puts a removed contact back when the backend refuses, then shows what it really holds", async () => {
    const made = await renderBook()
    const release = made.holdNext("remove_contact")
    // Removed elsewhere (another tab), so this page's remove is refused.
    made.removeContact(SEED_1, "Bob")

    fireEvent.click(screen.getByRole("button", { name: "Remove Bob" }))
    await screen.findByTestId("no-contacts")
    const releaseReread = made.holdNext("contacts")
    release()

    // Rolled back first: Bob is shown again while the re-read is held.
    await screen.findByText("Bob", {}, patiently)
    releaseReread()
    await screen.findByText(
      'Refused by the canister: no contact is named "Bob". The list is back as it was.',
      {},
      patiently
    )
    // Then the client's re-read shows the backend's own list.
    await screen.findByTestId("no-contacts", {}, patiently)
  })

  it("shows the error of the last write only", async () => {
    const made = await renderBook()
    made.addContact(SEED_1, { name: "Carol", owner: principal(SEED_2) })
    add("bob", SEED_2)
    const refused =
      'Refused by the canister: "bob" is in the address book already. The list is back as it was.'
    await screen.findByText(refused, {}, patiently)

    fireEvent.click(screen.getByRole("button", { name: "Remove Bob" }))

    await waitFor(
      () =>
        expect(made.contactsOf(SEED_1).map((c) => c.name)).toEqual(["Carol"]),
      patiently
    )
    await waitFor(() => expect(screen.queryByText(refused)).toBeNull())
  })
})
