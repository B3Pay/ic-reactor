import { useAgentManager } from "@ic-reactor/react"
import { useEffect, useRef } from "react"
import { Principal } from "@icp-sdk/core/principal"
import {
  IC_HOST_NETWORK_URI,
  LOCAL_HOST_NETWORK_URI,
} from "@ic-reactor/react/dist/utils"

const CanisterForm = ({ setCanisterId }) => {
  const canisterIdRef = useRef()
  const networkRef = useRef()

  const agentManager = useAgentManager()

  useEffect(() => {
    const dynamicCanisterId = localStorage.getItem("dynamicCanisterId")
    const dynamicNetwork = localStorage.getItem("dynamicNetwork")

    agentManager.updateAgent({
      host:
        dynamicNetwork === "local"
          ? LOCAL_HOST_NETWORK_URI
          : IC_HOST_NETWORK_URI,
    })

    if (dynamicCanisterId) {
      canisterIdRef.current.value = dynamicCanisterId
      setCanisterId(dynamicCanisterId)
    }
    if (dynamicNetwork) {
      networkRef.current.value = dynamicNetwork
    }
  }, [agentManager, setCanisterId])

  const onSubmit = (event) => {
    event.preventDefault()
    try {
      const principal = Principal.fromText(canisterIdRef.current?.value || "")
      const network = networkRef.current?.value || "ic"
      if (!principal) {
        throw new Error("Invalid canister id")
      }

      agentManager.updateAgent({
        host:
          network === "local" ? LOCAL_HOST_NETWORK_URI : IC_HOST_NETWORK_URI,
      })

      setCanisterId(principal.toText())
      localStorage.setItem("dynamicNetwork", network)
      localStorage.setItem("dynamicCanisterId", principal.toText())
    } catch (e) {
      throw new Error(e)
    }
  }
  return (
    <form onSubmit={onSubmit}>
      <select id="network" ref={networkRef}>
        <option value="local">Local</option>
        <option value="ic">IC</option>
      </select>
      <input
        id="canisterId"
        required
        ref={canisterIdRef}
        defaultValue="ryjl3-tyaaa-aaaaa-aaaba-cai"
      />
      <button type="submit">Fetch</button>
    </form>
  )
}

export default CanisterForm
