import { useUserPrincipal } from "@ic-reactor/react"
import ICRC1Call from "./ICRC2Call"
import { FunctionName } from "@ic-reactor/react/dist/types"
import { ICRC2 } from "./declarations/icrc2"
import Donation from "./Donation"
import Login from "./Login"
import { ICRC2Provider } from "./ICRC2Provider"
import { ICDVProvider } from "./ICDVProvider"
import ICDVToken from "./ICDVToken"
import { ICDV } from "./declarations/icdv"

interface AppProps {}

const functionNames: FunctionName<ICRC2 | ICDV>[] = [
  "icrc1_name",
  "icrc1_symbol",
  "icrc1_decimals",
]

const App: React.FC<AppProps> = () => {
  const principal = useUserPrincipal()

  return (
    <div>
      <h1>ICDEV Donation</h1>
      <Login />
      <ICRC2Provider>
        <h2>ICP</h2>
        <div style={{ display: "flex", gap: "1rem" }}>
          {functionNames.map((functionName) => (
            <ICRC1Call key={functionName} functionName={functionName} />
          ))}
        </div>
        <ICDVProvider>
          <h2>ICDV</h2>
          <div style={{ display: "flex", gap: "1rem" }}>
            {functionNames.map((functionName) => (
              <ICDVToken key={functionName} functionName={functionName} />
            ))}
          </div>
          {principal && <Donation principal={principal} />}
        </ICDVProvider>
      </ICRC2Provider>
    </div>
  )
}

export default App
