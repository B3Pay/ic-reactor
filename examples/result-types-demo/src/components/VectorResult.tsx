import { ResultFieldWithValue } from "@ic-reactor/candid"
import { ResultRenderer } from "./ResultRenderer"

export const VectorResult: React.FC<{
  result: ResultFieldWithValue<"vector">
}> = ({ result }) => (
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
      {result.value.length === 0 ? (
        <span style={{ color: "#888" }}>Empty</span>
      ) : (
        result.value.map((item, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: "5px",
            }}
          >
            <span style={{ marginRight: "5px", color: "#888" }}>[{index}]</span>
            <div style={{ flex: 1 }}>
              <ResultRenderer result={item} />
            </div>
          </div>
        ))
      )}
    </div>
  </div>
)
