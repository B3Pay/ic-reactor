import {
  useUserPrincipal,
  CandidAdapterProvider,
  useAuth,
} from "@ic-reactor/react"
import Login from "./Login"
import { CKBTCLedgerProvider } from "./CKBTC"
import { CKBTCMinterProvider } from "./Minter"
import CkbtcAddress from "./CkbtcAddress"
import CkbtcUpdateBalance from "./MinterUpdateBalance"
import RetrieveBTC from "./RetrieveBtc"

interface AppProps {}

const App: React.FC<AppProps> = () => {
  const { authenticated } = useAuth()
  const userPrincipal = useUserPrincipal()

  return (
    <div>
      <h1>ckBTC(TestNet) Wallet</h1>
      <Login />
      <CandidAdapterProvider>
        <CKBTCLedgerProvider>
          <CKBTCMinterProvider>
            {authenticated && userPrincipal ? (
              <CkbtcAddress userPrincipal={userPrincipal}>
                <CkbtcUpdateBalance userPrincipal={userPrincipal}>
                  <RetrieveBTC userPrincipal={userPrincipal} />
                </CkbtcUpdateBalance>
              </CkbtcAddress>
            ) : (
              <p>Login to see your BTC address and balance</p>
            )}
          </CKBTCMinterProvider>
        </CKBTCLedgerProvider>
      </CandidAdapterProvider>
    </div>
  )
}

export default App
