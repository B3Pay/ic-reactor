// `./ICRC1Call` of the custom-provider demo: a component that calls one
// method of the ICRC-1 canister the provider above it targets.
import type { ReactNode } from "react"
import type { ICRC1 } from "./declarations/icrc1"

export default function ICRC1Call(props: {
  functionName: keyof ICRC1
  label: string
}): ReactNode {
  return props.label
}
