import { createReactorStore } from "@ic-reactor/core"
import { VisitRandomArgs } from "../src"
import { _SERVICE, idlFactory } from "./candid/ledger"

describe("createReactorStore", () => {
  const { extractInterface } = createReactorStore<_SERVICE>({
    canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
    idlFactory,
    withVisitor: true,
  })

  const visitedRandom = () => {
    const iface = extractInterface()
    const fieldsVisitor = new VisitRandomArgs<_SERVICE>()
    return iface._fields.map(([_, field]) => {
      const args = fieldsVisitor.visitFunc(field)
      return args
    })
  }

  it("should visitFunction", () => {
    const fields = visitedRandom()
    // execute json with fx in the terminal
    console.log(fields)
  })
})
