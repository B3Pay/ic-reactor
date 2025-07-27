import { createReactorStore } from "@ic-reactor/core"
import { VisitDetail, VisitLayout, VisitField, VisitRandomRets } from "../src"
import { _SERVICE, idlFactory } from "./candid/ledger"
import { jsonToString } from "@ic-reactor/core/dist/utils"
import { describe, it, expect } from "bun:test"

describe("createReactorStore", () => {
  const { extractInterface } = createReactorStore<_SERVICE>({
    canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
    idlFactory,
    withVisitor: true,
  })

  const visitedLayout = () => {
    const iface = extractInterface()
    const fieldsVisitor = new VisitLayout<_SERVICE>()
    return ["VisitLayout", fieldsVisitor.visitService(iface, "ledger")]
  }

  const visitedDetail = () => {
    const iface = extractInterface()
    const fieldsVisitor = new VisitDetail<_SERVICE>()
    return ["VisitDetail", fieldsVisitor.visitService(iface)]
  }

  const visitedField = () => {
    const iface = extractInterface()
    const fieldsVisitor = new VisitField<_SERVICE>()
    return ["VisitField", fieldsVisitor.visitService(iface)]
  }
  const visitedRandom = () => {
    const iface = extractInterface()
    const fieldsVisitor = new VisitRandomRets<_SERVICE>()
    return fieldsVisitor.visitFunc(iface._fields[1][1])
  }

  describe("visited classes", () => {
    for (const [name, visited] of [
      visitedLayout(),
      visitedDetail(),
      visitedField(),
    ]) {
      it(`should visit ${name}`, () => {
        expect(jsonToString(visited)).toMatchSnapshot()
      })
    }
  })

  it("should visit random", () => {
    const visited = visitedRandom()
    console.log(jsonToString(visited))
  })
})
