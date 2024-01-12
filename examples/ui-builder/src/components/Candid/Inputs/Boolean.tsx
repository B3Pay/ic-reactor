import { Controller } from "react-hook-form"
import { RouteProps } from "../Route"
import LabelEditor from "../../FormBuilder/LabelEditor"

export interface BooleanProps extends RouteProps<"boolean"> {}

const Boolean: React.FC<BooleanProps> = ({ extractedField, registerName }) => {
  return (
    <div className="w-full flex items-center">
      <LabelEditor registerName={registerName} label={extractedField.label} />
      {/* <label htmlFor={registerName} className="block">
        {extractedField.label}
        <span className="text-red-500">*</span>
      </label> */}
      <Controller
        shouldUnregister
        name={`data.${registerName}` as never}
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
