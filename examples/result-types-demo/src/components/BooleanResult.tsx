import type { ResolvedNode } from "@ic-reactor/candid"

export const BooleanResult: React.FC<{
  result: ResolvedNode<"boolean">
}> = ({ result }) => (
  <div
    style={{ padding: "5px", border: "1px solid #ccc", borderRadius: "4px" }}
  >
    <strong>{result.label}: </strong>
    <input type="checkbox" checked={!!result.value} readOnly />
    <span>{result.value ? " True" : " False"}</span>
  </div>
)
