import { TextResult } from "./TextResult"
import { NumberResult } from "./NumberResult"
import { BooleanResult } from "./BooleanResult"
import { RecordResult } from "./RecordResult"
import { VariantResult } from "./VariantResult"
import { VectorResult } from "./VectorResult"
import { OptionalResult } from "./OptionalResult"
import { TupleResult } from "./TupleResult"
import { ResolvedNode } from "@ic-reactor/candid"

export const ResultRenderer: React.FC<{ result: ResolvedNode }> = ({
  result,
}) => {
  console.log(result)
  switch (result.type) {
    case "text":
      return <TextResult result={result as ResolvedNode<"text">} />
    case "number":
      return <NumberResult result={result as ResolvedNode<"number">} />
    case "boolean":
      return <BooleanResult result={result as ResolvedNode<"boolean">} />
    case "record":
      return <RecordResult result={result as ResolvedNode<"record">} />
    case "variant":
      return <VariantResult result={result as ResolvedNode<"variant">} />
    case "tuple":
      return <TupleResult result={result as ResolvedNode<"tuple">} />
    case "vector":
      return <VectorResult result={result as ResolvedNode<"vector">} />
    case "optional":
      return <OptionalResult result={result as ResolvedNode<"optional">} />
    case "principal":
      return <div>Principal: {String(result.value)}</div>
    case "null":
      return <div>Null</div>
    // Add other types as needed
    default:
      return (
        <div style={{ color: "red" }}>
          Unknown type: {result.type} ({JSON.stringify(result.value)})
        </div>
      )
  }
}
