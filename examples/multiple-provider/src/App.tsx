import { useUserPrincipal } from "@ic-reactor/react"
import ICPMethod from "./ICPMethod"
import Donation from "./Donation"
import Login from "./Login"
import { ICRC2Provider } from "./ICRC2Provider"
import { ICDVProvider } from "./ICDVProvider"
import ICDVMethod from "./ICDVMethod"

interface AppProps {}

const App: React.FC<AppProps> = () => {
  const principal = useUserPrincipal()

  return (
    <div>
      <h1>ICDEV Donation</h1>
      <Login />
      <ICRC2Provider>
        <ICPMethod functionName="icrc1_name" />
        <ICDVProvider>
          <ICDVMethod functionName="icrc1_name" />
          {principal && <Donation principal={principal} />}
        </ICDVProvider>
      </ICRC2Provider>
    </div>
  )
}

export default App
