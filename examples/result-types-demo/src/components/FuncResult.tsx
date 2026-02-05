import type { FuncNode, ResolvedNode } from "@ic-reactor/candid"

export const FuncResult: React.FC<{
  result: ResolvedNode<"func"> | FuncNode
}> = ({ result }) => {
  // If it's a resolved node, we have values
  const canisterId = (result as Partial<ResolvedNode<"func">>).canisterId
  const methodName = (result as Partial<ResolvedNode<"func">>).methodName

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        fontFamily: "monospace",
      }}
    >
      <span style={{ color: "#d946ef" }}>func</span>
      {canisterId && methodName ? (
        <span>
          {canisterId}.{methodName}
        </span>
      ) : (
        <span style={{ color: "#888" }}>(func definition)</span>
      )}
    </div>
  )
}
