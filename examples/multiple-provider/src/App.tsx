import { useUserPrincipal } from "@ic-reactor/react"
import ICRC1Call from "./ICRC2Call"
import Donation from "./Donation"
import Login from "./Login"
import { ICRC2Provider } from "./ICRC2Provider"
import { ICDVProvider } from "./ICDVProvider"
import ICDVToken from "./ICDVToken"

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
