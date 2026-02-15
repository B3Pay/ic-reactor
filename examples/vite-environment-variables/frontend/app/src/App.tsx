import React, { useRef } from "react"
import { useBackendMethod } from "./lib/canisters/backend"
import "./App.css"

function App() {
  const nameRef = useRef<HTMLInputElement>(null)

  const {
    data: greeting,
    call,
    isLoading,
  } = useBackendMethod({
    functionName: "greet",
  })

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = nameRef.current?.value || ""
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
        <form className="form" action="#" onSubmit={handleSubmit}>
          <label htmlFor="name">Enter your name</label>
          <div className="controls">
            <input
              id="name"
              type="text"
              className="input"
              placeholder="Ada Lovelace"
              ref={nameRef}
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
