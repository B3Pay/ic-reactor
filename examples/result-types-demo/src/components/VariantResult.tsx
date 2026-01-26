import React from "react"
import { ResolvedNode } from "@ic-reactor/candid"
import { ResultRenderer } from "./ResultRenderer"

export const VariantResult: React.FC<{
  result: ResolvedNode<"variant">
}> = ({ result }) => (
  <div
    style={{
      padding: "10px",
      border: "1px dashed #aaa",
      borderRadius: "4px",
      margin: "5px 0",
    }}
  >
    <strong>
      {result.label} (Variant: {result.value.option}):
    </strong>
    <div style={{ paddingLeft: "20px" }}>
      <ResultRenderer result={result.value.data} />
    </div>
  </div>
)
