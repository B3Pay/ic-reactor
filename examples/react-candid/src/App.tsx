import React, { createElement } from "react"
import { callActor, iterateActorState, useActorMethod } from "store"

interface LogsProps {}

const App: React.FC<LogsProps> = ({}) => {
  const { data, loading, error, call } = useActorMethod("print_log_entries")

  return (
    <div>
      <h1>React Example</h1>
      {iterateActorState((method, { loading, data, error, types }) => {
        const renderedInputs: JSX.Element[] = []

        const inputs: { [key: number]: string } = {}
        types.argTypes.forEach((arg, i) => {
          const input = createElement("input", {
            onChange: (e) => (inputs[i] = e.target.value),
            type: arg.display(),
          })
          renderedInputs.push(input)
        })

        const handleButtonClick = () => {
          const args = Object.values(inputs)

          console.log("args", args)
          // @ts-ignore
          callActor(method, ...args)
        }

        return (
          <div key={method}>
            <h2>{method}:</h2>
            <div>
              Loading: {loading.toString()}
              <br />
              Error: {error?.toString()}
              <br />
              Data:{" "}
              {JSON.stringify(data, (_, v) =>
                typeof v === "bigint" ? v.toString() : v
              )}
            </div>
            <div className="input-container">
              {renderedInputs.map((input, i) => (
                <React.Fragment key={i}>{input}</React.Fragment>
              ))}
            </div>
            <button className="btn" onClick={handleButtonClick}>
              Call
            </button>
          </div>
        )
      })}

      <h2>Logs:</h2>
      <div>
        Loading: {loading.toString()}
        <br />
        Error: {error?.toString()}
        <br />
        Data:{" "}
        {data?.map(({ counter, message }) => (
          <div key={counter}>
            {counter.toString()}: {message}
          </div>
        ))}
      </div>
      <button onClick={() => call()}>Get Logs</button>
    </div>
  )
}

export default App
