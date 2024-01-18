import Candid from "./Candid"
import { useMethodDetails } from "./actor"
// import FetchCandid from "./FetchCandid"
// import TestQuery from "./TestQuery"

interface AppProps {}

const App: React.FC<AppProps> = () => {
  const details = useMethodDetails()
  console.log(details)
  return <Candid />
  // return <FetchCandid />
  // return <TestQuery functionName="app" />
}

export default App
