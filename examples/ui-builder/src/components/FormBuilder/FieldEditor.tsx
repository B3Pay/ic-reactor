import { DraggableProvided } from "react-beautiful-dnd"
import ColorSelector from "./ColorSelector"
import { useWatch } from "react-hook-form"
import LabelEditor from "./LabelEditor"
import { cn } from "../../utils"
import FieldInput from "./FieldInput"

interface FieldEditorProps extends DraggableProvided {
  name: `items.${number}`
}

const FieldEditor: React.FC<FieldEditorProps> = ({
  name,
  innerRef,
  dragHandleProps,
  draggableProps,
}) => {
  const color = useWatch({ name: `${name}.color` })

  return (
    <div
      ref={innerRef}
      {...draggableProps}
      {...dragHandleProps}
      style={draggableProps.style}
      className={cn(
        "flex mb-2 justify-between items-end px-2 py-1 rounded space-x-2",
        color
      )}
    >
      <div className="w-8 h-14 text-white flex justify-center items-center">
        ┇
      </div>
      <div className="flex-1">
        <LabelEditor name={name} />
        <FieldInput name={`${name}.value`} />
      </div>
      <div className="w-8 h-8 px-2 text-white hidden sm:block">...</div>
      <ColorSelector name={`${name}.color`} />
    </div>
  )
}

export default FieldEditor
