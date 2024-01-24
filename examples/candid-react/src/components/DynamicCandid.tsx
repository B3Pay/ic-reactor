import { useMethodFields } from "@ic-reactor/react"
import MethodCall from "./Candid/MethodCall"
interface DynamicCandidProps {}

const DynamicCandid: React.FC<DynamicCandidProps> = () => {
  const methodDetails = useMethodFields()

  return (
    <div className="flex flex-col">
      {methodDetails.map(({ functionName, functionType }) => (
        <MethodCall
          functionName={functionName}
          type={functionType}
          key={functionName}
        />
      ))}
    </div>
  )
}

export default DynamicCandid
