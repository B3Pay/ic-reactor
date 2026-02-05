import type { ResolvedNode, ResultNode } from "@ic-reactor/candid"
import { BlobResult } from "./BlobResult"
import { BooleanResult } from "./BooleanResult"
import { FuncResult } from "./FuncResult"
import { NumberResult } from "./NumberResult"
import { OptionalResult } from "./OptionalResult"
import { RecordResult } from "./RecordResult"
import { TextResult } from "./TextResult"
import { TupleResult } from "./TupleResult"
import { VariantResult } from "./VariantResult"
import { VectorResult } from "./VectorResult"

// Helper type to bypass strict type checking for the demo
// In a real app, you might want better type guards
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UnsafeAny = any

export const ResultRenderer: React.FC<{
  result: ResolvedNode | ResultNode
}> = ({ result }) => {
  switch (result.displayType) {
    case "string":
      return <TextResult result={result as UnsafeAny} />
    case "number":
      return <NumberResult result={result as UnsafeAny} />
    case "boolean":
      return <BooleanResult result={result as UnsafeAny} />
    case "object":
      return <RecordResult result={result as UnsafeAny} />
    case "variant":
    case "result":
      return <VariantResult result={result as UnsafeAny} />
    case "array":
      if (result.type === "tuple") {
        return <TupleResult result={result as UnsafeAny} />
      }
      return <VectorResult result={result as UnsafeAny} />
    case "nullable":
      return <OptionalResult result={result as UnsafeAny} />
    case "blob":
      return <BlobResult result={result as UnsafeAny} />
    case "func":
      return <FuncResult result={result as UnsafeAny} />
    case "null":
      return <div>Null</div>
    // Add other types as needed

    default:
      return (
        <div style={{ color: "red" }}>
          Unknown type: {result.type} ({JSON.stringify(result.raw)})
        </div>
      )
  }
}
