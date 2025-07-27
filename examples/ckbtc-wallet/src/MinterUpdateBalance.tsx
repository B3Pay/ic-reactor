import { Principal } from "@ic-reactor/react/dist/types"
import { useCKBTCMinterMethod, useCKBTCMinterQueryCall } from "./Minter"
import { jsonToString } from "@ic-reactor/react/dist/utils"

type MinterUpdateBalanceProps = React.PropsWithChildren<{
  userPrincipal: Principal
}>

const MinterUpdateBalance: React.FC<MinterUpdateBalanceProps> = ({
  children,
  userPrincipal,
}) => {
  const { call, compileResult, isLoading } = useCKBTCMinterQueryCall({
    functionName: "update_balance",
    args: [{ owner: [userPrincipal], subaccount: [] }],
  })

  const { value, isOk, error, isErr } = compileResult()

  return (
    <div>
      <span>
        <strong>Update Balance</strong>:{" "}
        <button onClick={call} disabled={isLoading}>
          ↻
        </button>{" "}
        {isLoading ? (
          <div>loading...</div>
        ) : isOk ? (
          <div>Balance updated: {jsonToString(value)}</div>
        ) : isErr ? (
          <div>Error: {jsonToString(error)}</div>
        ) : (
          <div>Click to update balance</div>
        )}
      </span>
      {children}
    </div>
  )
}

export default MinterUpdateBalance
