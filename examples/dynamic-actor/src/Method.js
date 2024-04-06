import { useMethod } from "@ic-reactor/react"
import React from "react"
import { JsonView, defaultStyles } from "react-json-view-lite"

const renderCounter = new Map()

export const Method = ({ functionName, type }) => {
  const renderCount = renderCounter.get(functionName) || 0

  const { loading, error, data, call } = useMethod({
    functionName,
  })

  renderCounter.set(functionName, renderCount + 1)

  return (
    <pre
      className="json-view"
      style={{ textAlign: "left", opacity: loading ? 0.5 : 1 }}
    >
      <button onClick={call}>&#x21BB;</button>
      <JsonView
        data={{
          functionName,
          renderCount,
          loading,
          error,
          type,
          data,
        }}
        shouldExpandNode={(level) => {
          return level < 1
        }}
        style={{ ...defaultStyles, container: "" }}
      />
    </pre>
  )
}
