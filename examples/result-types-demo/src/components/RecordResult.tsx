import { ResultFieldWithValue } from "@ic-reactor/candid"
import { ResultRenderer } from "./ResultRenderer"

export const RecordResult: React.FC<{
  result: ResultFieldWithValue<"record">
}> = ({ result }) => (
  <div
    style={{
      padding: "10px",
      border: "1px solid #aaa",
      borderRadius: "4px",
      margin: "5px 0",
    }}
  >
    <strong>{result.field.label} (Record):</strong>
    <div style={{ paddingLeft: "20px" }}>
      {result.field.fields.map((field) => {
        const childResult = result.value?.[field.label] as
          | ResultFieldWithValue
          | undefined
        if (!childResult) return null
        return <ResultRenderer key={field.label} result={childResult} />
      })}
    </div>
  </div>
)
