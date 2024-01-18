import { useState, useEffect } from "react"
import Route, { RouteProps } from "./Route"
import { DynamicFieldType } from "@ic-reactor/react"

export interface RecursiveProps extends RouteProps<"recursive"> {}

const Recursive: React.FC<RecursiveProps> = ({
  extractedField,
  errors,
  registerName,
  shouldUnregister,
}) => {
  const [recursiveField, setRecursiveFields] = useState<DynamicFieldType>()

  useEffect(() => {
    const fields = extractedField.extract()
    setRecursiveFields(fields)
  }, [extractedField])

  return recursiveField ? (
    <Route
      shouldUnregister={shouldUnregister}
      extractedField={recursiveField}
      registerName={registerName}
      errors={errors}
    />
  ) : (
    <div>Loading...</div>
  )
}
export default Recursive
