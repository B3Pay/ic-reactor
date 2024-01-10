import { Controller, useFormContext } from "react-hook-form"
import { colors } from "."

interface ColorSelectorProps {
  name: `items.${number}.color`
}

const ColorSelector: React.FC<ColorSelectorProps> = ({ name }) => {
  const { control } = useFormContext()

  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <select {...field} className="w-32 h-8 px-2 py-1 rounded border">
          <option disabled>Colors</option>
          {Object.entries(colors).map(([color, value]) => (
            <option key={color} value={value}>
              {color}
            </option>
          ))}
        </select>
      )}
    />
  )
}

export default ColorSelector
