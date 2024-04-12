import { FunctionName, UseMethodParameters } from "@ic-reactor/react/dist/types"
import { useICDVQueryCall } from "./ICDVProvider"
import { jsonToString } from "@ic-reactor/core/dist/utils"
import { ICDV } from "./declarations/icdv"

interface ICDVMethodProps
  extends UseMethodParameters<ICDV, FunctionName<ICDV>> {}

const ICDVMethod: React.FC<ICDVMethodProps> = (props) => {
  const { call, data, loading } = useICDVQueryCall(props)

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

export default ICDVMethod
