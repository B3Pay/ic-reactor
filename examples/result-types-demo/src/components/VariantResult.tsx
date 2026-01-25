import React from "react"
import { ResultFieldWithValue } from "@ic-reactor/candid"
import { ResultRenderer } from "./ResultRenderer"

export const VariantResult: React.FC<{
  result: ResultFieldWithValue<"variant">
}> = ({ result }) => {
  // result.value is { option: string, value: ResultFieldWithValue }
  const { option, value: innerValue } = result.value

  if (!option || !innerValue) return <div>Empty Variant</div>

  return (
    <div
      style={{
        padding: "10px",
        border: "1px dashed #aaa",
        borderRadius: "4px",
        margin: "5px 0",
      }}
    >
      <strong>
        {result.field.label} (Variant: {option}):
      </strong>
      <div style={{ paddingLeft: "20px" }}>
        <ResultRenderer result={innerValue} />
      </div>
    </div>
  )
}
