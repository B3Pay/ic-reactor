import { useEffect } from "react"
import { Principal } from "@ic-reactor/react/dist/types"
import { useCKBTCMinterMethod } from "./Minter"

type GetBTCAddressProps = React.PropsWithChildren<{
  userPrincipal: Principal
}>

const GetBTCAddress: React.FC<GetBTCAddressProps> = ({
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
  console.log("🚀 ~ data:", data)

  return loading ? (
    <p>getting btc address...</p>
  ) : error ? (
    <p>Error: {error.message}</p>
  ) : data ? (
    <div>
      <p>
        <strong>BTC Address:</strong> {data}
      </p>
      {children}
    </div>
  ) : null
}

export default GetBTCAddress
