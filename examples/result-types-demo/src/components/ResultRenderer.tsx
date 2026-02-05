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

export const ResultRenderer: React.FC<{
  result: ResolvedNode | ResultNode
}> = ({ result }) => {
  switch (result.type) {
    case "text":
      return <TextResult result={result} />
    case "number":
      return <NumberResult result={result} />
    case "boolean":
      return <BooleanResult result={result} />
    case "record":
      return <RecordResult result={result} />
    case "variant":
      return <VariantResult result={result} />
    case "tuple":
      return <TupleResult result={result} />
    case "vector":
      return <VectorResult result={result} />
    case "optional":
      return <OptionalResult result={result} />
    case "blob":
      return <BlobResult result={result} />
    case "func":
      return <FuncResult result={result} />
    case "recursive":
      return <ResultRenderer result={result.inner} />
    case "null":
      return <div>Null</div>
    default:
      return (
        <div style={{ color: "red" }}>
          Unknown type: {result.type} ({JSON.stringify(result.raw)})
        </div>
      )
  }
}
