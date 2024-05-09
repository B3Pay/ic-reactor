import { createReactorStore } from "@ic-reactor/core"
import { VisitDetail, VisitLayout, VisitField } from "../src"
import { _SERVICE, idlFactory } from "./candid/ledger"
import { jsonToString } from "@ic-reactor/core/dist/utils"

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
})
