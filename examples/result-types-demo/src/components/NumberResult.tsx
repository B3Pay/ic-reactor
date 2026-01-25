import { ResultFieldWithValue } from "@ic-reactor/candid"

export const NumberResult: React.FC<{
  result: ResultFieldWithValue<"number">
}> = ({ result }) => (
  <div
    style={{ padding: "5px", border: "1px solid #ccc", borderRadius: "4px" }}
  >
    <strong>{result.field.label}: </strong>
    <span>{String(result.value)}</span>
    <span style={{ marginLeft: "10px", fontSize: "0.8em", color: "#666" }}>
      (Format: {result.field.numberFormat})
    </span>
  </div>
)
