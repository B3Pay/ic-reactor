// `./components/ResultRenderer` of the result-types demo: the component that
// renders one node `ResultFieldVisitor` resolved.
import type { ResolvedNode, ResultNode } from "@ic-reactor/candid"
import type { ReactNode } from "react"

export declare function ResultRenderer(props: {
  result: ResolvedNode | ResultNode
}): ReactNode
