import { type ResultNode } from "@ic-reactor/candid"
import { ResultRenderer } from "./ResultRenderer"

export const FuncRecordResult: React.FC<{
  result: ResultNode<"funcRecord">
}> = ({ result }) => {
  console.log("🚀 ~ FuncRecordResult ~ result:", result)
  const {
    canisterId,
    methodName,
    funcType,
    funcClass,
    funcFieldKey,
    argFields,
    defaultArgs,
  } = result
  console.log("🚀 ~ FuncRecordResult ~ funcClass:", funcClass)
  console.log("🚀 ~ FuncRecordResult ~ defaultArgs:", defaultArgs)

  return (
    <div
      style={{
        padding: "10px",
        border: "2px solid #8b5cf6",
        borderRadius: "6px",
        margin: "5px 0",
        background: "#faf5ff",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "8px",
        }}
      >
        <span
          style={{
            background: funcType === "query" ? "#10b981" : "#f59e0b",
            color: "#fff",
            fontSize: "11px",
            padding: "2px 6px",
            borderRadius: "4px",
            fontWeight: 600,
            textTransform: "uppercase",
          }}
        >
          {funcType}
        </span>
        <span style={{ fontFamily: "monospace", fontWeight: 600 }}>
          {result.displayLabel}
        </span>
      </div>

      {canisterId && methodName ? (
        <div
          style={{
            fontFamily: "monospace",
            fontSize: "13px",
            color: "#6b21a8",
            marginBottom: "8px",
            padding: "4px 8px",
            background: "#ede9fe",
            borderRadius: "4px",
          }}
        >
          {canisterId}.{methodName}()
        </div>
      ) : (
        <div style={{ color: "#888", marginBottom: "8px", fontSize: "13px" }}>
          {funcFieldKey}: (unresolved func reference)
        </div>
      )}

      {Object.keys(argFields).length > 0 && (
        <div>
          <div
            style={{
              fontSize: "12px",
              color: "#666",
              marginBottom: "4px",
              fontWeight: 600,
            }}
          >
            Default Arguments:
          </div>
          <div style={{ paddingLeft: "12px" }}>
            {Object.entries(argFields).map(([key, value]) => (
              <ResultRenderer key={key} result={value} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
