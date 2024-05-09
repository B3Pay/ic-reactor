import { Status } from "../src/status"
import { createReactorStore } from "@ic-reactor/core"
import { VisitDetail } from "../src"
import { _SERVICE, idlFactory } from "./candid/ledger"
import { deepEqual } from "assert"

describe("createReactorStore and visit", () => {
  const { extractInterface } = createReactorStore<_SERVICE>({
    canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
    idlFactory,
    withVisitor: true,
  })

  const visitedDetail = () => {
    const iface = extractInterface()
    const fieldsVisitor = new VisitDetail<_SERVICE>()
    return fieldsVisitor.visitService(iface)
  }

  it("should verify detail", () => {
    const detail = visitedDetail()
    expect(detail).toMatchSnapshot()
  })
})

describe("Status Loop", () => {
  it("should print same status info", () => {
    let status = "Status:\n"
    const statusEntries = Object.entries(Status.Flag)
    statusEntries.forEach(([key, value]) => {
      status += `${key}: ${value}\n`
    })
    status += "-----\nStatusType:\n"

    const statusTypeEntries = Object.entries(Status.Type)
    statusTypeEntries.forEach(([key, value]) => {
      status += `${key}: ${value}\n`
    })
    status += "-----\n"

    statusEntries.forEach(([key1, value1]) => {
      statusTypeEntries.forEach(([key2, value2]) => {
        status += `${key1} | ${key2}: ${value1 | value2}\n`
      })
    })

    expect(status).toMatchSnapshot()
  })
})

describe("Status", () => {
  it("should correctly identify hidden status", () => {
    const status = Status.Hidden()
    expect(Status.isHidden(status)).toBe(true)
  })

  it("should correctly identify checked status", () => {
    const status = Status.Hidden("Checked")
    expect(Status.isChecked(status)).toBe(true)
  })

  it("should correctly identify visible status", () => {
    const status = Status.Visible()
    expect(Status.isVisible(status)).toBe(true)
  })

  it("should correctly identify optional status", () => {
    const status = Status.Visible("Optional")
    expect(Status.isOptional(status)).toBe(true)
  })

  it("should correctly identify hidden optional status", () => {
    const status = Status.Hidden("Optional")
    expect(Status.isHidden(status)).toBe(true)
    expect(Status.isOptional(status)).toBe(true)
  })

  it("should correctly identify hidden checked status", () => {
    const status = Status.Hidden("Checked")
    expect(Status.isChecked(status)).toBe(true)
    expect(Status.isHidden(status)).toBe(true)
  })

  it("should correctly identify visible checked status", () => {
    const status = Status.Visible("Checked")
    expect(Status.isVisible(status)).toBe(true)
    expect(Status.isChecked(status)).toBe(true)
  })

  it("should correctly identify optional checked status", () => {
    const status = Status.Visible("Optional", "Checked")
    expect(Status.isOptional(status)).toBe(true)
    expect(Status.isChecked(status)).toBe(true)
  })

  it("should correctly toggle checked status", () => {
    let status = Status.Visible("Checked")
    status = Status.toggleChecked(status)
    expect(Status.isChecked(status)).toBe(false)
  })

  it("should correctly toggle visible status", () => {
    let status = Status.Visible()
    status = Status.toggleVisibility(status)
    expect(Status.isVisible(status)).toBe(false)
  })

  it("should correctly usable using switch", () => {
    let status = Status.Visible()
    switch (status) {
      case Status.Visible():
        expect(true).toBe(true)
        break
      default:
        expect(false).toBe(true)
    }

    status = Status.Hidden()
    switch (status) {
      case Status.Hidden():
        expect(true).toBe(true)
        break
      default:
        expect(false).toBe(true)
    }

    status = Status.Visible("Checked")
    switch (true) {
      case Status.isChecked(status):
        expect(true).toBe(true)
        break
      default:
        expect(false).toBe(true)
    }

    status = Status.Hidden("Checked")
    switch (true) {
      case Status.isChecked(status):
        expect(true).toBe(true)
        break
      default:
        expect(false).toBe(true)
    }

    status = Status.Visible("Checked")
    switch (status) {
      case Status.Visible("Checked"):
        expect(true).toBe(true)
        break
      default:
        expect(false).toBe(true)
    }

    if (Status.isVisible(status) && Status.isChecked(status))
      expect(true).toBe(true)

    if (Status.isHidden(status)) expect(false).toBe(true)

    status = Status.Visible("Checked")
    switch (status) {
      case Status.Visible("Checked"):
        expect(true).toBe(true)
        break
      default:
        expect(false).toBe(true)
    }

    status = Status.Hidden("Checked")
    switch (status) {
      case Status.Hidden("Checked"):
        expect(true).toBe(true)
        break
      default:
        expect(false).toBe(true)
    }
  })
})
