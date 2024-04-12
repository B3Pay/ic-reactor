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

const App: React.FC<AppProps> = () => {
  const principal = useUserPrincipal()

  return (
    <div>
      <h1>ICDEV Donation</h1>
      <Login />
      <ICRC2Provider>
        <ICRC1Call functionName="icrc1_name" />
        <ICDVProvider>
          <ICDVToken functionName="icrc1_name" />
          {principal && <Donation principal={principal} />}
        </ICDVProvider>
      </ICRC2Provider>
    </div>
  )
}

export default App
