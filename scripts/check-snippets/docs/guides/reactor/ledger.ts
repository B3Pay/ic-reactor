// `src/reactor/ledger.ts` of the guides: a `DisplayReactor` over an ICRC-1
// ledger (`app/declarations/ledger.ts`).
import { defineDisplayReactor } from "@ic-reactor/react"
import {
  canisterId,
  idlFactory,
  type _SERVICE,
} from "../../../app/declarations/ledger"

export const { reactor: ledger } = defineDisplayReactor<_SERVICE>({
  name: "ledger",
  idlFactory,
  canisterId,
})
