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

  return loading ? (
    <p>getting balance...</p>
  ) : (
    <div>
      <p>Update Result: {jsonToString(data)}</p>
      {children}
    </div>
  )
}

export default MinterUpdateBalance
