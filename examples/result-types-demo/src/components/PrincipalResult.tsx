import type { ResultNode } from "@ic-reactor/candid"

export const PrincipalResult: React.FC<{ result: ResultNode<"principal"> }> = ({
  result,
}) => (
  <div
    style={{ padding: "5px", border: "1px solid #ccc", borderRadius: "4px" }}
  >
    <strong>{result.label}: </strong>
    <span>{result.value}</span>
    <span style={{ marginLeft: "10px", fontSize: "0.8em", color: "#666" }}>
      (Format: {result.format})
    </span>
  </div>
)
