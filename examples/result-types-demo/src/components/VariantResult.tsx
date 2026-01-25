import React from "react"
import { ResultFieldWithValue } from "@ic-reactor/candid"
import { ResultRenderer } from "./ResultRenderer"

export const VariantResult: React.FC<{
  result: ResultFieldWithValue<"variant">
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
      {result.field.label} (Variant: {result.value.option}):
    </strong>
    <div style={{ paddingLeft: "20px" }}>
      <ResultRenderer result={result.value.value} />
    </div>
  </div>
)
