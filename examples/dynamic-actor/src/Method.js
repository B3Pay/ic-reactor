import { useMethod } from "@ic-reactor/react"
import React from "react"
import { JsonView, defaultStyles } from "react-json-view-lite"

const renderCounter = new Map()

export const Method = ({ functionName, type }) => {
  const { requestKey, loading, error, data, call } = useMethod({
    functionName,
  })

  const renderKey = `${functionName}-${requestKey}`

  const renderCount = renderCounter.get(renderKey) || 1

  renderCounter.set(renderKey, renderCount + 1)

  return (
    <pre className="json-view" style={{ textAlign: "left" }}>
      <div>
        {functionName}
        <button onClick={call}>&#x21BB;</button>
      </div>
      <JsonView
        data={{
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
