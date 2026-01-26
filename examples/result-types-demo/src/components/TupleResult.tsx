import type { ResolvedNode } from "@ic-reactor/candid"
import { ResultRenderer } from "./ResultRenderer"

export const TupleResult: React.FC<{
  result: ResolvedNode<"tuple">
}> = ({ result }) => (
  <div
    style={{
      padding: "10px",
      border: "1px solid #999",
      borderRadius: "4px",
      margin: "5px 0",
      backgroundColor: "#f9f9f9",
    }}
  >
    <strong>{result.label || "Tuple"}:</strong>
    <div
      style={{
        paddingLeft: "10px",
        display: "flex",
        gap: "10px",
        flexWrap: "wrap",
        marginTop: "5px",
      }}
    >
      {result.items.map((item, index) => (
        <div
          key={index}
          style={{
            border: "1px dashed #ccc",
            padding: "5px",
            borderRadius: "4px",
          }}
        >
          <ResultRenderer result={item} />
        </div>
      ))}
    </div>
  </div>
)
