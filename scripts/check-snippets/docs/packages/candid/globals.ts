// Names the pages of the candid package docs share: the adapter and the
// reactor their first examples build, and the values later fragments use.
// `reactor` is one name for the four reactors of the pages, so it holds the
// raw family: the CandidReactor page and the index only use what a
// MetadataReactor inherits. The display pages build their own reactor in the
// snippet, as their first example does.
import type {
  CandidAdapter,
  FieldNode,
  FormArgumentsMeta,
  FuncRecordNode,
  MetadataReactor,
} from "@ic-reactor/candid"
import type { ActorSubclass } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"
import type { Principal } from "@icp-sdk/core/principal"
import type { AnyFieldApi, AnyFormApi } from "@tanstack/react-form"
import type { ReactNode } from "react"
import "./react-form-stub"
import type { _SERVICE as LedgerService } from "../../../app/declarations/ledger"

export * from "../../../app/globals"

/** The adapter of `new CandidAdapter({ clientManager })`. */
export declare const adapter: CandidAdapter

/** A canister's Candid source, such as `adapter.fetchCandidSource` returns. */
export declare const candidSource: string

/** The reactor of the raw pages' first example, over an ICRC-1 ledger. */
export declare const reactor: MetadataReactor

/** The account owner an ICRC-1 call is made for, and a recipient. */
export declare const owner: Principal
export declare const recipient: Principal

/** A service type, such as `idlFactory({ IDL })` returns. */
export declare const service: IDL.ServiceClass

/** The form metadata of a ledger's `icrc1_transfer`, and an actor for it. */
export declare const methodMeta: FormArgumentsMeta
export declare const actor: ActorSubclass<LedgerService>

/** The Candid-encoded arguments of a call, as hex text. */
export declare const candidArgsHex: string

/** A resolved `funcRecord` node, such as a ledger's archived block range. */
export declare const archived: FuncRecordNode

/** The field renderer of the MetadataDisplayReactor page. */
export declare function DynamicFieldInput(props: {
  field: FieldNode
  form: AnyFormApi
  fieldApi: AnyFieldApi
}): ReactNode

/** A field of a form's metadata, such as one of `inputMeta.args`. */
export declare const field: FieldNode
