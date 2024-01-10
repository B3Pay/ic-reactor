import { useState, useEffect } from "react"
import Route, { RouteProps } from "./Route"
import { ExtractedField } from "@ic-reactor/store/dist/candid"

interface RecursiveProps extends RouteProps {}

const Recursive: React.FC<RecursiveProps> = ({
  field,
  errors,
  registerName,
}) => {
  const [extractedField, setExtractedFields] = useState<ExtractedField>()

  useEffect(() => {
    const fields = field.extract?.()
    setExtractedFields(fields)
  }, [field])

  return extractedField ? (
    <Route
      field={extractedField}
      registerName={registerName}
      errors={errors?.[field.label as never]}
    />
  ) : (
    <div>Loading...</div>
  )
}
export default Recursive
