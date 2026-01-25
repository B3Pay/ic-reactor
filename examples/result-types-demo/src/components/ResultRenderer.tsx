import { ResultFieldWithValue } from "@ic-reactor/candid"
import { TextResult } from "./TextResult"
import { NumberResult } from "./NumberResult"
import { BooleanResult } from "./BooleanResult"
import { RecordResult } from "./RecordResult"
import { VariantResult } from "./VariantResult"
import { VectorResult } from "./VectorResult"
import { OptionalResult } from "./OptionalResult"

export const ResultRenderer: React.FC<{ result: ResultFieldWithValue }> = ({
  result,
}) => {
  if (!result || !result.field) return <div>Invalid Result</div>

  switch (result.field.type) {
    case "text":
      return <TextResult result={result as ResultFieldWithValue<"text">} />
    case "number":
      return <NumberResult result={result as ResultFieldWithValue<"number">} />
    case "boolean":
      return (
        <BooleanResult result={result as ResultFieldWithValue<"boolean">} />
      )
    case "record":
      return <RecordResult result={result as ResultFieldWithValue<"record">} />
    case "variant":
      return (
        <VariantResult result={result as ResultFieldWithValue<"variant">} />
      )
    case "vector":
      return <VectorResult result={result as ResultFieldWithValue<"vector">} />
    case "optional":
      return (
        <OptionalResult result={result as ResultFieldWithValue<"optional">} />
      )
    case "principal":
      return <div>Principal: {String(result.value)}</div>
    case "null":
      return <div>Null</div>
    // Add other types as needed
    default:
      return (
        <div style={{ color: "red" }}>
          Unknown type: {result.field.type} ({JSON.stringify(result.value)})
        </div>
      )
  }
}
