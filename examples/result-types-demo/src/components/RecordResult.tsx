import { ResolvedNode } from "@ic-reactor/candid"
import { ResultRenderer } from "./ResultRenderer"

export const RecordResult: React.FC<{
  result: ResolvedNode<"record">
}> = ({ result }) => (
  <div
    style={{
      padding: "10px",
      border: "1px solid #aaa",
      borderRadius: "4px",
      margin: "5px 0",
    }}
  >
    <strong>{result.label} (Record):</strong>
    <div style={{ paddingLeft: "20px" }}>
      {Object.entries(result.value).map(([key, value]) => (
        <ResultRenderer key={key} result={value} />
      ))}
    </div>
  </div>
)
