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
    case "blob":
      return <BlobResult result={result as ResolvedNode<"blob">} />
    case "func":
      return <FuncResult result={result as ResolvedNode<"func">} />
    case "null":
      return <div>Null</div>
    case "recursive":
      return <RecursiveResult result={result as ResolvedNode<"recursive">} />
    default:
      return (
        <div style={{ color: "red" }}>
          Unknown type: {result.type} ({JSON.stringify(result.raw)})
        </div>
      )
  }
}
