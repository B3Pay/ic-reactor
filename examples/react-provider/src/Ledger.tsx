import { useActorState } from "@ic-reactor/react"
import ICRCBalance from "./ICRCBalance"
import ICRCTransfer from "./ICRCTransfer"

interface LedgerProps {}

const Ledger: React.FC<LedgerProps> = ({}) => {
  const { name, canisterId } = useActorState()
  return (
    <div>
      <h1>
        {name}
        <span style={{ fontSize: "0.2em", color: "gray" }}>({canisterId})</span>
      </h1>
      <ul>
        <li>
          <ICRCBalance />
        </li>
        <li>
          <ICRCTransfer />
        </li>
      </ul>
    </div>
  )
}

export default Ledger
