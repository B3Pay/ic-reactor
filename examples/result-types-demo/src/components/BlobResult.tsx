import type { ResultNode } from "@ic-reactor/candid"

// Keep the DOM bounded: a blob's hex value doubles its byte size, so a
// multi-megabyte payload pasted verbatim would stall the page. Show a
// prefix and lean on the byte count + hash for identity.
const HEX_PREVIEW_CHARS = 128

export const BlobResult: React.FC<{
  result: ResultNode<"blob">
}> = ({ result }) => {
  // A blob node's value is always a hex string, at every size — no
  // Uint8Array branch to handle. `result.length` carries the byte count.
  const hex = result.value
  const preview =
    hex.length > HEX_PREVIEW_CHARS ? `${hex.slice(0, HEX_PREVIEW_CHARS)}…` : hex
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
      <code style={{ fontSize: "0.9em", color: "#333" }}>{preview}</code>
      {result.length > 0 && (
        <span style={{ fontSize: "0.75em", color: "#888" }}>
          {" "}
          ({result.length} bytes)
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
