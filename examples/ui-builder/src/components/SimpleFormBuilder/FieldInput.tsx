import { useFormContext } from "react-hook-form"

interface FieldInputProps extends React.HTMLAttributes<HTMLInputElement> {
  name: `items.${number}.value`
}

const SimpleFieldInput: React.FC<FieldInputProps> = ({ name, ...rest }) => {
  const { register, watch } = useFormContext()

  const field = watch(name)

  return (
    <input
      {...register(name)}
      type="text"
      placeholder={field.label}
      className="flex-grow w-full h-8 px-2 py-1 rounded border"
      {...rest}
    />
  )
}

export default SimpleFieldInput
