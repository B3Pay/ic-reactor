import { useState, useEffect } from "react"
import { toggleChaosMode, getChaosStatus } from "../lib/factories"
import type { FrontendLog } from "../lib/types"
import { Button } from "@/components/ui/button"
import { Shield, Flame } from "lucide-react"

interface ControlPanelProps {
  addLog: (type: FrontendLog["type"], message: string) => void
}

/**
 * Component to toggle Chaos Mode.
 * Simulates backend failures to demonstrate optimistic rollbacks.
 */
export function ControlPanel({ addLog }: ControlPanelProps) {
  const [isChaosEnabled, setIsChaosEnabled] = useState(false)
  const { data: chaosStatus } = getChaosStatus.useQuery()

  useEffect(() => {
    if (chaosStatus !== undefined) {
      setIsChaosEnabled(chaosStatus)
    }
  }, [chaosStatus])

  const { mutate: toggleChaos, isPending: isTogglingChaos } =
    toggleChaosMode.useMutation({
      onSuccess: (status) => {
        setIsChaosEnabled(status)
        addLog(
          status ? "error" : "success",
          `Chaos Mode ${status ? "ACTIVATED" : "DEACTIVATED"}`
        )
      },
      onError: (err) => {
        addLog("error", `Failed to toggle chaos: ${err.message}`)
      },
    })

  return (
    <div className="flex gap-4 items-center justify-center">
      <Button
        variant={isChaosEnabled ? "destructive" : "secondary"}
        size="lg"
        onClick={() => toggleChaos([])}
        disabled={isTogglingChaos}
        className={`font-bold transition-all duration-300 ${
          isChaosEnabled
            ? "shadow-[0_0_20px_rgba(239,68,68,0.4)] scale-105 hover:scale-110"
            : "hover:bg-secondary/80"
        }`}
      >
        {isChaosEnabled ? (
          <>
            <Flame className="w-5 h-5 mr-2 animate-pulse" />
            Chaos Active
          </>
        ) : (
          <>
            <Shield className="w-5 h-5 mr-2" />
            Stable Mode
          </>
        )}
      </Button>
    </div>
  )
}
