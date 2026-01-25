import { ResultFieldWithValue } from "@ic-reactor/candid"
import { ResultRenderer } from "./ResultRenderer"

export const TupleResult: React.FC<{
  result: ResultFieldWithValue<"tuple">
}> = ({ result }) => {
  const items = result.value

  if (!items) return <div>Null Tuple</div>

  return (
    <div
      style={{
        padding: "10px",
        border: "1px solid #999",
        borderRadius: "4px",
        margin: "5px 0",
        backgroundColor: "#f9f9f9",
      }}
    >
      <strong>{result.field.label || "Tuple"}:</strong>
      <div
        style={{
          paddingLeft: "10px",
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          marginTop: "5px",
        }}
      >
        {items.map((item, index) => (
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
}
