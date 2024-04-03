import { useAgentManager } from "@ic-reactor/react"
import { useEffect, useRef } from "react"
import { Principal } from "@dfinity/principal"
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
      console.error(e)
    }
  }
  return (
    <form onSubmit={onSubmit} className="flex justify-center mb-2">
      <select
        id="network"
        className="border py-1 px-2 mr-2 rounded-lg"
        ref={networkRef}
      >
        <option value="local">Local</option>
        <option value="ic">IC</option>
      </select>
      <input
        id="canisterId"
        className="flex-auto border py-1 px-2 mr-2 rounded-lg w-80"
        required
        ref={canisterIdRef}
        defaultValue="ss2fx-dyaaa-aaaar-qacoq-cai"
      />
      <button
        className="flex-1 border p-1 rounded-lg bg-blue-500 text-white"
        type="submit"
      >
        Fetch
      </button>
    </form>
  )
}

export default CanisterForm
