import { createReactorStore } from "@ic-reactor/core"
import { VisitDetails, VisitReturns } from "../src"
import { _SERVICE, idlFactory } from "./candid/ledger"
import { jsonToString } from "@ic-reactor/core/dist/utils"
import { writeFileSync } from "fs"
import path from "path"

describe("createReactorStore", () => {
  const { extractInterface } = createReactorStore<_SERVICE>({
    canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
    idlFactory,
    withVisitor: true,
  })

  const visitedDetail = () => {
    const iface = extractInterface()
    const fieldsVisitor = new VisitDetails()
    return fieldsVisitor.visitService(iface)
  }

  const visitedField = () => {
    const iface = extractInterface()
    const fieldsVisitor = new VisitReturns()
    return fieldsVisitor.visitService(iface)
  }

  it("should visitFunction", () => {
    const json = jsonToString(visitedField())
    // execute json with fx in the terminal
    writeFileSync(path.join(__dirname, "candid-field.json"), json)
  })
})
