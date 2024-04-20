import {
  FunctionName,
  UseQueryCallParameters,
} from "@ic-reactor/react/dist/types"
import { useICRC1QueryCall } from "./ICRC1Provider"
import { ICRC1 } from "./declarations/icrc1"
import { jsonToString } from "@ic-reactor/core/dist/utils"

interface ICRC1CallProps<M extends FunctionName<ICRC1> = FunctionName<ICRC1>>
  extends UseQueryCallParameters<ICRC1, M> {
  functionName: M
}

const ICRC1Call: React.FC<ICRC1CallProps> = ({ functionName, ...rest }) => {
  const { call, data, loading } = useICRC1QueryCall({
    functionName,
    ...rest,
  })

  return (
    <div>
      <span>
        <strong>{functionName}</strong>:{" "}
        <button onClick={call} disabled={loading}>
          ↻
        </button>{" "}
        {loading ? "Loading..." : jsonToString(data)}
      </span>
    </div>
  )
}

export default ICRC1Call
