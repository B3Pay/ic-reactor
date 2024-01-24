import { useCallback, useState } from "react"
import Button from "../Button"
import Route from "./Routes"
import { FormProvider, useForm } from "react-hook-form"
import {
  MethodFields,
  ServiceDefaultValues,
  extractAndSortArgs,
} from "@ic-reactor/store"

interface FormProps extends MethodFields {
  callHandler: (args: never) => Promise<any>
}

const MethodForm: React.FC<FormProps> = ({
  functionName,
  defaultValues,
  fields,
  callHandler,
}) => {
  const methods = useForm({
    mode: "onChange",
    defaultValues,
  })

  const [argState, setArgState] = useState<any>(null)
  const [argErrorState, setArgErrorState] = useState<any>(null)

  const onVerifyArgs = useCallback(
    (data: ServiceDefaultValues) => {
      const argsObject = data[functionName]
      console.log("argsObject", argsObject)

      setArgState(null)
      setArgErrorState(null)

      const args = extractAndSortArgs(argsObject)
      console.log("args", args)

      let errorMessages = ""
      const isInvalid = args.some((arg, i) => {
        const validateArg = fields[i]?.validate(arg)
        if (typeof validateArg === "string") {
          errorMessages = validateArg
          return false
        }
        return true
      })

      if (isInvalid === true) {
        setArgState(args)
        return args
      } else {
        setArgErrorState(errorMessages)
      }
    },
    [fields, functionName]
  )

  const onSubmitCall = useCallback(
    async (data: ServiceDefaultValues) => {
      const argsObject = data[functionName]
      console.log("argsObject", argsObject)

      setArgState(null)
      setArgErrorState(null)

      const args = extractAndSortArgs(argsObject)
      console.log("args", args)

      setArgState(args)

      try {
        const result = await callHandler(args as never)
        console.log("result", result)
      } catch (error) {
        console.log("error", error)
      }
    },
    [callHandler, functionName]
  )

  const resetHandler = useCallback(() => {
    setArgErrorState(null)
    methods.reset(defaultValues)
    setArgState(null)
  }, [methods, defaultValues])

  return (
    <FormProvider {...methods}>
      <form className="border border-gray-500 rounded p-2 mt-2 w-full box-border">
        <div className="flex justify-between items-start w-full space-x-1">
          <label className="flex-auto">{functionName}</label>
          <button
            type="button"
            className="flex-shrink-0 text-xs border-red-600 border-2 px-2 py-1 rounded text-red-600 hover:bg-red-600 hover:text-white"
            onClick={resetHandler}
          >
            Reset
          </button>
        </div>
        {fields.map((field, index) => (
          <Route
            key={index}
            extractedField={field}
            registerName={`${functionName}.arg${index}`}
            errors={methods.formState.errors?.[functionName]?.[`arg${index}`]}
          />
        ))}
        {argState && (
          <fieldset className="border p-2 my-2 rounded">
            <legend className="font-semibold">Arguments</legend>
            <span className="text-sm">
              ({" "}
              {argState
                .map((arg: any) => JSON.stringify(arg, null, 2))
                .join(", ")}{" "}
              )
            </span>
          </fieldset>
        )}
        {argErrorState && (
          <fieldset className="border p-2 my-2 text-red-500 border-red-500 rounded">
            <legend className="font-semibold">Arguments Error</legend>
            <span className="text-sm">
              <div>{argErrorState}</div>
            </span>
          </fieldset>
        )}
        <div className="mt-2 flex items-center space-x-2">
          <Button
            onClick={methods.handleSubmit(onVerifyArgs)}
            className="py-1 bg-blue-500 hover:bg-blue-700 text-white font-bold rounded"
          >
            Verify Args
          </Button>
          <Button
            className="py-1 bg-green-500 hover:bg-green-700 text-white font-bold rounded"
            onClick={methods.handleSubmit(onSubmitCall)}
          >
            Call
          </Button>
        </div>
      </form>
    </FormProvider>
  )
}

export default MethodForm
