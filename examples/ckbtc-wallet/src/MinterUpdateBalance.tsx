import { Principal } from "@ic-reactor/react/dist/types"
import { useCKBTCMinterMethod } from "./Minter"
import { useEffect } from "react"
import { jsonToString } from "@ic-reactor/react/dist/utils"

type MinterUpdateBalanceProps = React.PropsWithChildren<{
  userPrincipal: Principal
}>

const MinterUpdateBalance: React.FC<MinterUpdateBalanceProps> = ({
  children,
  userPrincipal,
}) => {
  const { call, data, loading } = useCKBTCMinterMethod({
    functionName: "update_balance",
    args: [{ owner: [userPrincipal], subaccount: [] }],
  })

  useEffect(() => {
    call()
  }, [])

  return (
    <div>
      <span>
        <strong>Update Balance</strong>:{" "}
        <button onClick={call} disabled={loading}>
          ↻
        </button>{" "}
        {loading ? "Loading..." : jsonToString(data)}
      </span>
      {children}
    </div>
  )
}

export default MinterUpdateBalance
