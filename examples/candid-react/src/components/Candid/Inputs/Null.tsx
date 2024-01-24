import { Controller } from "react-hook-form"
import { RouteProps } from "../Routes"

export interface NullProps extends RouteProps<"null"> {}

const Null: React.FC<NullProps> = ({ registerName, shouldUnregister }) => {
  return (
    <Controller
      shouldUnregister={shouldUnregister}
      name={registerName as never}
      defaultValue={null as never}
      render={() => null as never}
    />
  )
}

export default Null
