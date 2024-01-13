import { cn } from "../../../utils"
import { Controller, useFormContext } from "react-hook-form"
import { RouteProps } from "../Route"
import LabelEditor from "../../FormBuilder/LabelEditor"

export interface TextProps extends RouteProps {}

const Text: React.FC<TextProps> = ({
  registerName,
  errors,
  extractedField,
}) => {
  const { resetField, trigger } = useFormContext()

  const resetHandler = () => {
    resetField(registerName as never)
    trigger(registerName as never, { shouldFocus: true })
  }

  const errorMessage = errors?.message?.toString()

  return (
    <div className="w-full p-1">
      <LabelEditor registerName={registerName} label={extractedField.label} />
      {errorMessage && (
        <span className="text-red-500 text-xs ml-1">( {errorMessage} )</span>
      )}
      <div className="relative">
        <Controller
          shouldUnregister
          name={`data.${registerName}`}
          defaultValue={extractedField.defaultValue}
          rules={extractedField}
          render={({ field }) => (
            <input
              id={registerName}
              {...field}
              className={cn(
                "w-full h-8 pl-2 pr-8 border rounded",
                !!errors ? "border-red-500" : "border-gray-300"
              )}
              type="text"
              placeholder={extractedField.type}
            />
          )}
        />
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-center w-8 text-red-500 pb-1 px-1 cursor-pointer"
          onClick={resetHandler}
        >
          <span className="text-2xl leading-5 font-bold">×</span>
        </div>
      </div>
    </div>
  )
}

export default Text
