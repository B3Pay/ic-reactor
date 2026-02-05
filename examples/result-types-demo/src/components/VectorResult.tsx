import type { ResultNode } from "@ic-reactor/candid"
import { ResultRenderer } from "./ResultRenderer"

export const VectorResult: React.FC<{
  result: ResultNode<"vector">
}> = ({ result }) => (
  <div
    style={{
      padding: "10px",
      border: "1px solid #ccc",
      borderRadius: "4px",
      margin: "5px 0",
    }}
  >
    <strong>{result.label || "Vector"}:</strong>
    <div style={{ paddingLeft: "20px", marginTop: "5px" }}>
      {result.items.length === 0 ? (
        <span style={{ color: "#888" }}>Empty</span>
      ) : (
        result.items.map((item, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: "5px",
            }}
          >
            <span style={{ marginRight: "5px", color: "#888" }}>
              [{index + 1}]
            </span>
            <div style={{ flex: 1 }}>
              <ResultRenderer result={item} />
            </div>
          </div>
        ))
      )}
    </div>
  </div>
)
