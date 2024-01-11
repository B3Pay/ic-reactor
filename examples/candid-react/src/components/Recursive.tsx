import { useState, useEffect } from "react"
import Route, { RouteProps } from "./Route"
import { DynamicFieldType, IDL } from "@ic-reactor/react/dist/types"

interface RecursiveProps extends RouteProps<IDL.RecClass> {}

const Recursive: React.FC<RecursiveProps> = ({
  field,
  errors,
  registerName,
}) => {
  const [extractedField, setExtractedFields] =
    useState<DynamicFieldType<IDL.Type>>()

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
