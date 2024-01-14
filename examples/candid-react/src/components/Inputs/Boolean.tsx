import { Controller } from "react-hook-form"
import { RouteProps } from "../Route"

export interface BooleanProps extends RouteProps<"boolean"> {}

const Boolean: React.FC<BooleanProps> = ({
  extractedField,
  shouldUnregister,
  registerName,
}) => {
  return (
    <div className="w-full flex items-center ml-1">
      <label htmlFor={registerName} className="block mr-2">
        {extractedField.label}
      </label>
      <Controller
        shouldUnregister={shouldUnregister}
        name={registerName}
        defaultValue={false as never}
        render={({ field }) => (
          <input
            {...field}
            id={registerName}
            className="h-4 w-4 ml-4 border rounded"
            type="checkbox"
          />
        )}
      />
    </div>
  )
}

export default Boolean
