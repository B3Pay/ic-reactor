import { Status, StatusHelper } from "../src/status"
import { createReactorStore } from "@ic-reactor/core"
import { VisitDetails } from "../src"
import { _SERVICE, idlFactory } from "./candid/ledger"
import { jsonToString } from "@ic-reactor/core/dist/utils"
import { readFileSync, writeFileSync } from "fs"
import path from "path"

describe("createReactorStore", () => {
  const { extractInterface } = createReactorStore<_SERVICE>({
    canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
    idlFactory,
    withVisitor: true,
  })

  const visitedDetail = () => {
    const iface = extractInterface()
    const fieldsVisitor = new VisitDetails<_SERVICE>()
    return fieldsVisitor.visitService(iface)
  }

  it("should visitFunction", () => {
    const fields = visitedDetail()
    // execute json with fx in the terminal
    writeFileSync(
      path.join(__dirname, "candid-detail.json"),
      jsonToString(fields)
    )
  })
})

describe("Status Loop", () => {
  it("should loop into all status", () => {
    let status = ""
    Object.keys(Status).forEach((key) => {
      status += key + ": " + Status[key] + "\n"
    })
    for (let i = 0; i < 32; i++) {
      let statusString = i + ": "
      if (StatusHelper.isHidden(i)) {
        statusString += "Hidden "
      }
      if (StatusHelper.isChecked(i)) {
        statusString += "Checked "
      }
      if (StatusHelper.isVisible(i)) {
        statusString += "Visible "
      }
      if (StatusHelper.isOptional(i)) {
        statusString += "Optional "
      }
      status += statusString + "\n"
    }
    const snapshot = readFileSync(path.join(__dirname, "status-loop.txt"), {
      encoding: "utf-8",
    })

    expect(status).toBe(snapshot)
  })
})

describe("StatusHelper", () => {
  it("should correctly identify hidden status", () => {
    const status = Status.Hidden
    expect(StatusHelper.isHidden(status)).toBe(true)
  })

  it("should correctly identify checked status", () => {
    const status = Status.Checked
    expect(StatusHelper.isChecked(status)).toBe(true)
  })

  it("should correctly identify visible status", () => {
    const status = Status.Visible
    expect(StatusHelper.isVisible(status)).toBe(true)
  })

  it("should correctly identify optional status", () => {
    const status = Status.Optional
    expect(StatusHelper.isOptional(status)).toBe(true)
  })

  it("should correctly identify hidden optional status", () => {
    const status = Status.Hidden | Status.Optional
    expect(StatusHelper.isHidden(status)).toBe(true)
    expect(StatusHelper.isOptional(status)).toBe(true)
  })

  it("should correctly identify hidden checked status", () => {
    const status = Status.Checked | Status.Hidden
    expect(StatusHelper.isChecked(status)).toBe(true)
    expect(StatusHelper.isHidden(status)).toBe(true)
  })

  it("should correctly identify visible checked status", () => {
    const status = Status.Visible | Status.Checked
    expect(StatusHelper.isVisible(status)).toBe(true)
    expect(StatusHelper.isChecked(status)).toBe(true)
  })

  it("should correctly identify optional checked status", () => {
    const status = Status.Optional | Status.Checked
    expect(StatusHelper.isOptional(status)).toBe(true)
    expect(StatusHelper.isChecked(status)).toBe(true)
  })

  it("should correctly toggle checked status", () => {
    let status = Status.Checked
    status = StatusHelper.toggleChecked(status)
    expect(StatusHelper.isChecked(status)).toBe(false)
  })

  it("should correctly toggle visible status", () => {
    let status = Status.Visible
    status = StatusHelper.toggleVisibility(status)
    expect(StatusHelper.isVisible(status)).toBe(false)
  })

  it("should correctly usable using switch", () => {
    let status = Status.Visible
    switch (status) {
      case Status.Visible:
        expect(true).toBe(true)
        break
      default:
        expect(false).toBe(true)
    }

    status = Status.Hidden
    switch (status) {
      case Status.Hidden:
        expect(true).toBe(true)
        break
      default:
        expect(false).toBe(true)
    }

    status = Status.Checked
    switch (status) {
      case Status.Checked:
        expect(true).toBe(true)
        break
      default:
        expect(false).toBe(true)
    }

    status = Status.Optional
    switch (status) {
      case Status.Optional:
        expect(true).toBe(true)
        break
      default:
        expect(false).toBe(true)
    }

    status = Status.Visible | Status.Checked
    switch (status) {
      case Status.Visible | Status.Checked:
        expect(true).toBe(true)
        break
      default:
        expect(false).toBe(true)
    }

    status = Status.Visible | Status.Optional
    switch (status) {
      case Status.Visible | Status.Optional:
        expect(true).toBe(true)
        break
      default:
        expect(false).toBe(true)
    }

    status = Status.Hidden | Status.Checked
    switch (status) {
      case Status.Hidden | Status.Checked:
        expect(true).toBe(true)
        break
      default:
        expect(false).toBe(true)
    }
  })
})
