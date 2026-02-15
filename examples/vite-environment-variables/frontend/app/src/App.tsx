import { useBackendMethod } from "./lib/canisters/backend"
import "./App.css"

function App() {
  const {
    data: greeting,
    call,
    isLoading,
  } = useBackendMethod({
    functionName: "greet",
    enabled: false,
  })

  function submit(formData: FormData) {
    const name = formData.get("name") as string
    call([name])
  }

  return (
    <main className="page">
      <section className="panel">
        <div className="brand" aria-label="ICP plus Vite">
          <img src="/icp.svg" alt="ICP logo" className="brand-icp" />
          <span className="plus">+</span>
          <img src="/vite.svg" alt="Vite logo" className="brand-vite" />
        </div>
        <h1 className="title">Frontend Environment Variables</h1>
        <p className="subtitle">
          Call the backend canister and get a greeting.
        </p>
        <form action={submit}>
          <label htmlFor="name">Enter your name</label>
          <div className="controls">
            <input
              id="name"
              name="name"
              type="text"
              className="input"
              placeholder="Ada Lovelace"
            />
            <button type="submit" className="button" disabled={isLoading}>
              {isLoading ? "Greeting..." : "Greet me"}
            </button>
          </div>
        </form>
        <section id="greeting" className="greeting" aria-live="polite">
          {greeting}
        </section>
      </section>
    </main>
  )
}

export default App
