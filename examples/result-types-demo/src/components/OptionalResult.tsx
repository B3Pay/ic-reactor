import { ResultFieldWithValue } from "@ic-reactor/candid"
import { ResultRenderer } from "./ResultRenderer"

export const OptionalResult: React.FC<{
  result: ResultFieldWithValue<"optional">
}> = ({ result }) => (
  <div style={{ padding: "5px", margin: "5px 0" }}>
    <strong>{result.field.label}: </strong>
    {result.value === null ? (
      <span style={{ color: "#aaa", fontStyle: "italic" }}>null</span>
    ) : (
      <div style={{ display: "inline-block", verticalAlign: "top" }}>
        <ResultRenderer result={result.value.value as ResultFieldWithValue} />
      </div>
    )}
  </div>
)
