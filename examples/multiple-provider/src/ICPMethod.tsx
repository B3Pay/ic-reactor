import { FunctionName, UseMethodParameters } from "@ic-reactor/react/dist/types"
import { useICPMethod } from "./ICPProvider"
import { ICRC2 } from "./declarations/icrc2"
import { jsonToString } from "@ic-reactor/core/dist/utils"

interface ICPMethodProps
  extends UseMethodParameters<ICRC2, FunctionName<ICRC2>> {}

const ICPMethod: React.FC<ICPMethodProps> = (props) => {
  const { call, data, loading } = useICPMethod(props)

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div>
        <strong>{props.functionName}</strong>:{" "}
        <button onClick={call} disabled={loading}>
          ↻
        </button>
      </div>
      {loading ? "Loading..." : jsonToString(data)}
    </div>
  )
}

export default ICPMethod
