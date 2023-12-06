import Login from "Login"
import Notes from "Notes"
import AddNote from "./AddNote"

const publicKey = crypto.getRandomValues(new Uint8Array(48))

const App = () => {
  return (
    <div>
      <Login />
      <Notes publicKey={publicKey} />
      <AddNote publicKey={publicKey} />
    </div>
  )
}

export default App
