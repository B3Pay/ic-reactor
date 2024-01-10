// import Candid from "./Candid"
// import FetchCandid from "./FetchCandid"

// import FormEditor from "./FormBuilder"
import SimpleFormBuilder from "./FormBuilder"

interface AppProps {}

const App: React.FC<AppProps> = () => {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <SimpleFormBuilder />
      {/* <FormEditor /> */}
    </div>
  )
  // return <Candid />
  // return <FetchCandid />
}

export default App
