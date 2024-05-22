import { useEffect } from "react"
import { Principal } from "@ic-reactor/react/dist/types"
import { useCKBTCMinterMethod } from "./Minter"

type CkbtcAddressProps = React.PropsWithChildren<{
  userPrincipal: Principal
}>

const CkbtcAddress: React.FC<CkbtcAddressProps> = ({
  userPrincipal,
  children,
}) => {
  const { call, data, error, loading } = useCKBTCMinterMethod({
    functionName: "get_btc_address",
    args: [{ owner: [userPrincipal], subaccount: [] }],
  })

  useEffect(() => {
    call()
  }, [])

  return loading ? (
    <p>getting btc address...</p>
  ) : error ? (
    <p>Error: {error.message}</p>
  ) : (
    <div>
      <p>BTC Address: {data}</p>
      {children}
    </div>
  )
}

export default CkbtcAddress
