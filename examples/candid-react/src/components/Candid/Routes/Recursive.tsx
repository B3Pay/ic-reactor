import { useMemo } from "react"
import Route, { RouteProps } from "."

export interface RecursiveProps extends RouteProps<"recursive"> {}

const Recursive: React.FC<RecursiveProps> = ({
  extractedField: { extract },
  registerName,
  errors,
  ...rest
}) => {
  const field = useMemo(() => extract(), [extract])

  return field ? (
    <Route
      extractedField={field}
      registerName={registerName}
      errors={errors}
      {...rest}
    />
  ) : (
    <div>Loading...</div>
  )
}

export default Recursive
