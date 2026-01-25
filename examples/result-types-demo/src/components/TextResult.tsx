import { ResultFieldWithValue } from "@ic-reactor/candid"

export const TextResult: React.FC<{ result: ResultFieldWithValue<"text"> }> = ({
  result,
}) => {
  // result.field is strictly TextResultField
  // result.value is strictly string

  return (
    <div
      style={{ padding: "5px", border: "1px solid #ccc", borderRadius: "4px" }}
    >
      <strong>{result.field.label}: </strong>
      <span>{result.value}</span>
      <span style={{ marginLeft: "10px", fontSize: "0.8em", color: "#666" }}>
        (Format: {result.field.textFormat})
      </span>
    </div>
  )
}
