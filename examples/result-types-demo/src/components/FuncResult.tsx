import type { FuncNode, ResultNode } from "@ic-reactor/candid"

export const FuncResult: React.FC<{
  result: ResultNode<"func"> | FuncNode
}> = ({ result }) => {
  // If it's a resolved node, we have values
  const canisterId = result.canisterId
  const methodName = result.methodName

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
