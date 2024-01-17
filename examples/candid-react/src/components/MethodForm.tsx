import { useCallback, useState } from "react"
import Button from "./Inputs/Button"
import Route from "./Route"
import { useFormContext } from "react-hook-form"
import { ExtractedFunction } from "@ic-reactor/store"
import { CandidType } from "../actor"

interface FormProps extends ExtractedFunction<CandidType> {
  callHandler: (args: [any]) => Promise<any>
}

const MethodForm: React.FC<FormProps> = ({
  callHandler,
  functionName,
  defaultValues,
  fields,
}) => {
  const { reset, handleSubmit, formState } = useFormContext()

  const [argState, setArgState] = useState<any>(null)
  const [argErrorState, setArgErrorState] = useState<any>(null)

  const onVerifyArgs = useCallback(
    (data: any) => {
      console.log(data)
      setArgState(null)
      setArgErrorState(null)
      const args = data.data ? Object.values(data.data) : []
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
    [fields]
  )

  const onSubmitCall = useCallback(
    async (data: any) => {
      setArgState(null)
      setArgErrorState(null)
      const args = data.data ? Object.values(data.data) : []
      console.log("args", args)
      setArgState(args)

      try {
        const result = await callHandler(args as [any])
        console.log("result", result)
      } catch (error) {
        console.log("error", error)
      }
    },
    [callHandler]
  )

  const resetHandler = useCallback(() => {
    reset(defaultValues)
    setArgState(null)
    setArgErrorState(null)
  }, [defaultValues, reset])

  return (
    <form
      onSubmit={handleSubmit(onVerifyArgs)}
      className="border border-gray-500 rounded p-2 mt-2 w-full"
    >
      <div className="flex justify-between items-center w-full">
        <h1 className="text-xl font-bold mb-4">{functionName}</h1>
        <button
          className="mb-2 border-red-600 border-2 rounded px-2 py-1 text-red-600 hover:bg-red-600 hover:text-white"
          type="reset"
          onClick={resetHandler}
        >
          Reset
        </button>
      </div>
      {fields.map((field, index) => {
        return (
          <div key={index} className="mb-2">
            <Route
              extractedField={field}
              registerName={`data.arg${index}`}
              errors={formState.errors?.data?.[`arg${index}` as never]}
            />
          </div>
        )
      })}
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
      <div className="flex items-center">
        <Button
          type="submit"
          className="mt-2 py-2 px-4 text-lg bg-blue-500 hover:bg-blue-700 text-white font-bold rounded"
        >
          Verify Args
        </Button>
        <Button
          className="mt-2 ml-2 py-2 px-4 text-lg bg-green-500 hover:bg-green-700 text-white font-bold rounded"
          onClick={handleSubmit(onSubmitCall)}
        >
          Call
        </Button>
      </div>
    </form>
  )
}

export default MethodForm
