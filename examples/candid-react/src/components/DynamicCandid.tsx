import { useMethodFields } from "@ic-reactor/react"
import MethodCall from "./Candid/MethodCall"
interface DynamicCandidProps {}

const DynamicCandid: React.FC<DynamicCandidProps> = () => {
  const methodDetails = useMethodFields()

  return methodDetails.map(({ functionName, functionType }) => (
    <MethodCall
      functionName={functionName}
      type={functionType}
      key={functionName}
    />
  ))
}

export default DynamicCandid
