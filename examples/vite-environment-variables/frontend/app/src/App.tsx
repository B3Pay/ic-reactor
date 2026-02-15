import { useState } from "react"
import { useBackendQuery } from "./lib/canisters/backend"
import "./App.css"

function App() {
  const [name, setName] = useState("")

  const { data: greeting, refetch } = useBackendQuery({
    functionName: "greet",
    args: [name],
  })

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    refetch()
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
        <form className="form" action="#" onSubmit={handleSubmit}>
          <label htmlFor="name">Enter your name</label>
          <div className="controls">
            <input
              id="name"
              alt="Name"
              type="text"
              className="input"
              placeholder="Ada Lovelace"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit" className="button">
              Greet me
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
