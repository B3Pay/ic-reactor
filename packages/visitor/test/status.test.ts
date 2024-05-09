import { Status } from "../src/status"
import { createReactorStore } from "@ic-reactor/core"
import { VisitDetail } from "../src"
import { _SERVICE, idlFactory } from "./candid/ledger"

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

    const statusTypeEntries = Object.entries(Status.Prop)
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
    expect(Status.isChecked(status)).toBe(true)
    status = Status.setUncheck(status)
    expect(Status.isChecked(status)).toBe(false)
  })

  it("should correctly toggle checked status", () => {
    let status = Status.Visible()
    status = Status.setCheck(status)
    expect(Status.isChecked(status)).toBe(true)
    status = Status.setUncheck(status)
    expect(Status.isChecked(status)).toBe(false)
  })

  it("should throw an error when hiding a non-optional status", () => {
    let status = Status.Visible()
    expect(() => Status.setHide(status)).toThrow(
      "Cannot modify a non-optional status"
    )

    status = Status.Hidden()

    expect(() => Status.setShow(status)).toThrow(
      "Cannot modify a non-optional status"
    )
  })

  it("should correctly toggle visible status", () => {
    let status = Status.Visible("Optional")
    status = Status.setHide(status)
    expect(Status.isVisible(status)).toBe(false)
  })

  it("should correctly usable using switch", () => {
    let status = Status.Visible()
    if (status === Status.Visible()) {
      expect(true).toBe(true)
    } else {
      expect(false).toBe(true)
    }

    status = Status.Hidden()
    if (status === Status.Hidden()) {
      expect(true).toBe(true)
    } else {
      expect(false).toBe(true)
    }

    status = Status.Visible("Checked")
    if (Status.isChecked(status)) {
      expect(true).toBe(true)
    } else {
      expect(false).toBe(true)
    }

    status = Status.Hidden("Checked")
    if (Status.isChecked(status)) {
      expect(true).toBe(true)
    } else {
      expect(false).toBe(true)
    }

    status = Status.Visible("Checked")
    if (status === Status.Visible("Checked")) {
      expect(true).toBe(true)
    } else {
      expect(false).toBe(true)
    }

    if (Status.isVisible(status) && Status.isChecked(status)) {
      expect(true).toBe(true)
    }

    if (Status.isHidden(status)) {
      expect(false).toBe(true)
    }

    status = Status.Visible()
    if (Status.isVisible(status) && !Status.isChecked(status)) {
      expect(true).toBe(true)
    } else {
      expect(false).toBe(true)
    }

    status = Status.Hidden("Checked")
    if (Status.isChecked(status) && Status.isHidden(status)) {
      expect(true).toBe(true)
      status = Status.setCheck(status)
      expect(Status.isChecked(status)).toBe(true)
      status = Status.setUncheck(status)
      expect(Status.isChecked(status)).toBe(false)
    } else {
      expect(false).toBe(true)
    }
  })

  it("should return props", () => {
    let status = Status.Visible("Optional")
    expect(Status.allString(status)).toStrictEqual({
      flag: "Visible",
      props: ["Optional"],
    })

    status = Status.setHide(status)

    expect(Status.isHidden(status)).toBe(true)

    expect(Status.allString(status)).toStrictEqual({
      flag: "Hidden",
      props: ["Optional"],
    })

    status = Status.setShow(status)

    expect(Status.isVisible(status)).toBe(true)

    expect(Status.allString(status)).toStrictEqual({
      flag: "Visible",
      props: ["Optional"],
    })
  })

  it("should return props", () => {
    let status = Status.Visible("Optional", "Row", "Checked")
    expect(Status.allString(status)).toStrictEqual({
      flag: "Visible",
      props: ["Optional", "Checked", "Row"],
    })

    status = Status.setHide(status)

    expect(Status.isHidden(status)).toBe(true)

    expect(Status.allString(status)).toStrictEqual({
      flag: "Hidden",
      props: ["Optional", "Checked", "Row"],
    })
  })
})
