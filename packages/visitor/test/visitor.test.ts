import { createReactorStore } from "@ic-reactor/core"
import {
  VisitRandomResponse,
  VisitDetails,
  VisitRandomArgs,
  VisitTransform,
  VisitLayouts,
  VisitFields,
} from "../src"
import { b3wallet, idlFactory } from "./candid/b3wallet"
import { jsonToString } from "@ic-reactor/core/dist/utils"
import accountView from "./account_view.json"

type B3Wallet = typeof b3wallet

describe("createReactorStore", () => {
  const { actorStore, extractInterface, visitFunction } =
    createReactorStore<B3Wallet>({
      canisterId: "2vxsx-fae",
      idlFactory,
      withVisitor: true,
    })

  const visitedService = () => {
    const iface = extractInterface()
    const fieldsVisitor = new VisitLayouts()
    return fieldsVisitor.visitService(iface)
  }

  const visitedTransform = () => {
    const fieldsVisitor = new VisitTransform()
    return visitFunction.get_account_views(fieldsVisitor, {
      label: "accountView",
      value: accountView,
    })
  }

  const visitedDetail = () => {
    const fieldsVisitor = new VisitDetails()
    return visitFunction.account_create(fieldsVisitor)
  }

  const visitedFields = () => {
    const fieldsVisitor = new VisitFields()
    return visitFunction.account_swap_btc_to_ckbtc(fieldsVisitor)
  }

  it("should visitFunction", () => {
    // console.log(jsonToString(visitedTransform()))
    console.log(jsonToString(visitedDetail()))

    // const args = visitFunction.get_app(new VisitRandomArgs<B3Wallet>())
    // console.log(args)
    // const details = visitedService()
    // console.log(jsonToString(details))

    // const value = visitFunction.get_app(new VisitRandomResponse<B3Wallet>())
    // console.log(value)

    // const transform = visitFunction.get_app(new VisitTransform(), {
    //   value,
    //   label: "test",
    // })
    // console.log(transform.values)

    // const { methodState, initialized, initializing, error } =
    //   actorStore.getState()

    // expect({ methodState, initialized, initializing, error }).toEqual({
    //   methodState: {},
    //   initialized: true,
    //   initializing: false,
    //   error: undefined,
    // })
  })
})
