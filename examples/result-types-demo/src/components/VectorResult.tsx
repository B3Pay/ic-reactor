import { ResultFieldWithValue } from "@ic-reactor/candid"
import { ResultRenderer } from "./ResultRenderer"

export const VectorResult: React.FC<{
  result: ResultFieldWithValue<"vector">
}> = ({ result }) => {
  const items = result.value

  if (!items) return <div>Null Vector</div>

  return (
    <div
      style={{
        padding: "10px",
        border: "1px solid #ccc",
        borderRadius: "4px",
        margin: "5px 0",
      }}
    >
      <strong>{result.field.label || "Vector"}:</strong>
      <div style={{ paddingLeft: "20px", marginTop: "5px" }}>
        {items.length === 0 ? (
          <span style={{ color: "#888" }}>Empty</span>
        ) : (
          items.map((item, index) => (
            <div key={index} style={{ marginBottom: "5px" }}>
              <span style={{ marginRight: "5px", color: "#888" }}>
                [{index}]
              </span>
              <ResultRenderer result={item} />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
