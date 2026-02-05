import type { ResultNode } from "@ic-reactor/candid"

export const BlobResult: React.FC<{
  result: ResultNode<"blob">
}> = ({ result }) => {
  const isString = typeof result.value === "string"
  return (
    <div
      style={{
        padding: "5px",
        border: "1px solid #ccc",
        borderRadius: "4px",
        wordBreak: "break-all",
        backgroundColor: "#f9f9f9",
      }}
    >
      <strong>{result.label || "Blob"}: </strong>
      {isString ? (
        <code style={{ fontSize: "0.9em", color: "#333" }}>{result.value}</code>
      ) : (
        <span style={{ fontSize: "0.9em", color: "#666" }}>
          Byte Array ({(result.value as unknown as Uint8Array).length} bytes)
        </span>
      )}
      {result.hash && (
        <div
          style={{
            fontSize: "0.75em",
            color: "#888",
            marginTop: "4px",
            borderTop: "1px solid #eee",
            paddingTop: "2px",
          }}
        >
          <strong>Hash:</strong> {result.hash}
        </div>
      )}
    </div>
  )
}
