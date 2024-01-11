// import Candid from "./Candid"
// import FetchCandid from "./FetchCandid"

// import FormEditor from "./FormBuilder"
import Candid from "./Candid"
import FormBuilder, { colors } from "./components/FormBuilder"

interface AppProps {}

const App: React.FC<AppProps> = () => {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <FormBuilder
        items={[
          {
            value: "First Red item ",
            color: colors.Pink,
            label: "Item 1",
            editedLabel: "Item 1",
          },
          {
            value: "Second Green item",
            color: colors.Red,
            label: "Item 2",
            editedLabel: "Item 2",
          },
          {
            value: "Last Item",
            color: colors.Purple,
            label: "Item 3",
            editedLabel: "Item 3",
          },
        ]}
      />
      {/* <FormEditor /> */}
      <Candid />
    </div>
  )
  // return <FetchCandid />
}

export default App
