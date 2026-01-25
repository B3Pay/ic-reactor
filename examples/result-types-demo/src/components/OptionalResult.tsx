import { ResultFieldWithValue } from "@ic-reactor/candid"
import { ResultRenderer } from "./ResultRenderer"

export const OptionalResult: React.FC<{
  result: ResultFieldWithValue<"optional">
}> = ({ result }) => {
  const innerValue = result.value as ResultFieldWithValue | null

  return (
    <div style={{ padding: "5px", margin: "5px 0" }}>
      <strong>{result.field.label}: </strong>
      {innerValue === null ? (
        <span style={{ color: "#aaa", fontStyle: "italic" }}>null</span>
      ) : (
        <div style={{ display: "inline-block", verticalAlign: "top" }}>
          <ResultRenderer result={innerValue} />
        </div>
      )}
    </div>
  )
}
