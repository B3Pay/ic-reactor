// `./ledger` of the core guide: a `DisplayReactor` of an ICRC-1 ledger.
import { DisplayReactor } from "@ic-reactor/core"
import {
  canisterId,
  idlFactory,
  type _SERVICE,
} from "../app/declarations/ledger"
import { clientManager } from "./globals"

export const ledger = new DisplayReactor<_SERVICE>({
  clientManager,
  idlFactory,
  name: "ledger",
  canisterId,
})
