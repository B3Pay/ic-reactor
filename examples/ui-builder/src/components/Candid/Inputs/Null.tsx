import { Controller } from "react-hook-form"
import { RouteProps } from "../Route"

export interface NullProps extends RouteProps<"null"> {}

const Null: React.FC<NullProps> = ({ registerName }) => {
  return (
    <Controller
      name={registerName as never}
      defaultValue={null as never}
      render={() => null as never}
      shouldUnregister
    />
  )
}

export default Null
