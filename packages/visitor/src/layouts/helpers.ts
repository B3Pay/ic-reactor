import { FunctionCategory } from "../types"
import {
  GOVERNANCE_TEST,
  SETTING_TEST,
  STATUS_TEST,
  WALLET_TEST,
} from "./constants"

export const findCategory = (name: string): FunctionCategory => {
  const categories = [
    { name: "home", test: [] },
    {
      name: "wallet",
      test: WALLET_TEST,
    },
    {
      name: "status",
      test: STATUS_TEST,
    },
    {
      name: "setting",
      test: SETTING_TEST,
    },
    { name: "governance", test: GOVERNANCE_TEST },
  ]
  const category = categories.find((c) =>
    c.test.some((t) => name.toLowerCase().includes(t))
  )?.name as FunctionCategory
  return category || "home"
}
