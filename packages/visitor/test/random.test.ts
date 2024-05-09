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
    return iface._fields[0][1].accept(fieldsVisitor, iface._fields[0][0])
  }

  it("should visitFunction", () => {
    const random = visitedRandom()

    const expected = {
      arg0: {
        owner: expect.anything(),
        subaccount: expect.anything(),
      },
    }

    expect(random).toMatchObject(expected)
  })
})
