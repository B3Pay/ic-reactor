import { ActorProvider, AgentProvider } from "@ic-reactor/react"
import DynamicCandid from "./components/DynamicCandid"
import { useRef, useState, useEffect } from "react"
import { Principal } from "@dfinity/principal"

interface AppProps {}

const App: React.FC<AppProps> = () => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [canisterId, setCanisterId] = useState<string>()

  useEffect(() => {
    const dynamicCanisterId = localStorage.getItem("dynamicCanisterId")
    if (dynamicCanisterId) {
      setCanisterId(dynamicCanisterId)
    }
  }, [])

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    try {
      const principal = Principal.fromText(inputRef.current?.value || "")

      if (!principal) {
        throw new Error("Invalid canister id")
      }

      setCanisterId(principal.toText())
      localStorage.setItem("dynamicCanisterId", principal.toText())
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <AgentProvider withDevtools>
      <div className="py-2 max-w-2xl mx-auto">
        <h1 className="text-center text-xl font-bold mb-2">Dynamic Candid</h1>
        <form onSubmit={onSubmit} className="flex justify-center">
          <input
            id="canisterId"
            className="flex-auto border py-1 px-2 mr-2 rounded w-80"
            required
            ref={inputRef}
            defaultValue={canisterId}
          />
          <button
            className="flex-1 border p-1 rounded bg-blue-500 text-white"
            type="submit"
          >
            Fetch
          </button>
        </form>
        {canisterId && (
          <ActorProvider canisterId={canisterId} withDevtools withVisitor>
            <DynamicCandid />
          </ActorProvider>
        )}
      </div>
    </AgentProvider>
  )
}

export default App
