import type { ResolvedNode } from "@ic-reactor/candid"
import { ResultRenderer } from "./ResultRenderer"

export const VariantResult: React.FC<{
  result: ResolvedNode<"variant">
}> = ({ result }) => (
  <div
    style={{
      padding: "10px",
      border: "1px dashed #aaa",
      borderRadius: "4px",
      margin: "5px 0",
    }}
  >
    <strong>
      {result.label} (Variant: {result.label}):
    </strong>
    <div style={{ paddingLeft: "20px" }}>
      <ResultRenderer result={result.selectedOption} />
    </div>
  </div>
)
