import { useForm, useFieldArray, FormProvider } from "react-hook-form"
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd"
import { useEffect } from "react"
import SimpleFieldEditor from "./FieldEditor"
import { cn } from "../../utils"

export const colors = {
  Purple: "bg-purple-500",
  Pink: "bg-pink-500",
  Red: "bg-red-500",
  Green: "bg-green-500",
  Yellow: "bg-yellow-500",
  Cyan: "bg-cyan-500",
  Gray: "bg-gray-500",
} as const

export type Color = keyof typeof colors

type Item = {
  value: string
  label: string
  editedLabel: string
  color: string
}

interface FormBuilderProps {
  items: Item[]
}

const SimpleFormBuilder: React.FC<FormBuilderProps> = ({ items }) => {
  const methods = useForm({
    defaultValues: { items },
  })

  const { control, reset, getValues, setValue, handleSubmit } = methods

  const { fields, move } = useFieldArray({
    control,
    name: "items",
  })

  useEffect(() => {
    const serializedState = localStorage.getItem("simpleForm")
    if (serializedState) {
      console.log("serializedState", serializedState)
      setValue("items", JSON.parse(serializedState))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveFormState = (e: any) => {
    e.preventDefault()
    const fields = getValues("items")
    const serializedState = JSON.stringify(fields)
    console.log("serializedState", serializedState)
    localStorage.setItem("simpleForm", serializedState)
  }

  const onDragEnd = (result: any) => {
    if (!result.destination) {
      return
    }
    move(result.source.index, result.destination.index)
  }

  const onSubmit = (data: any) => {
    console.log(data.items)
  }

  const touched = methods.formState.touchedFields

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="border p-2 rounded">
        <h1 className="text-2xl font-bold">Simple Form Builder</h1>
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="droppable">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef}>
                {fields.map((item, index) => (
                  <Draggable key={item.id} draggableId={item.id} index={index}>
                    {(provided) => (
                      <SimpleFieldEditor
                        name={`items.${index}`}
                        {...provided}
                      />
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
        <div className="flex space-x-2 mt-2">
          <button
            type="submit"
            className="py-1 px-2 rounded border flex-grow bg-blue-500 text-white"
          >
            Submit
          </button>
          <button
            onClick={saveFormState}
            disabled={!touched}
            className={cn(
              "py-1 px-2 w-28 rounded border bg-green-500 text-white",
              !touched && "opacity-50 cursor-not-allowed"
            )}
          >
            Save
          </button>
          <button
            onClick={(e) => {
              e.preventDefault()
              reset()
              localStorage.removeItem("simpleForm")
            }}
            className="py-1 px-2 rounded border bg-red-500 text-white"
          >
            Reset
          </button>
        </div>
      </form>
    </FormProvider>
  )
}

export default SimpleFormBuilder
