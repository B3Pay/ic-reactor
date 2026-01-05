import { useHeart } from "../lib/useHeart"
import { ControlPanel } from "./ControlPanel"
import type { FrontendLog } from "../lib/types"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { ShieldCheck } from "lucide-react"

interface GlobalHeartProps {
  addLog: (type: FrontendLog["type"], message: string) => void
}

/**
 * The main interactive component displaying the Global Heart.
 * Shows the current like count and allows users to toggle their like status.
 */
export function GlobalHeart({ addLog }: GlobalHeartProps) {
  const {
    isLiked,
    likesCount,
    handleHeartClick,
    isLikesLoading,
    savedUpdates,
  } = useHeart(addLog)

  return (
    <Card className="glass-strong border-primary/20 overflow-hidden relative">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />

      {/* Saved Updates Counter */}
      {savedUpdates > 0 && (
        <div className="absolute top-4 right-4 z-20 animate-in fade-in slide-in-from-top-2 duration-500">
          <Badge
            variant="secondary"
            title="Unnecessary network calls prevented by optimistic debouncing"
            className="bg-slate-950/60 backdrop-blur border-border/40 text-[10px] pl-2 pr-3 py-1 gap-1.5 shadow-xl hover:bg-slate-900/80 transition-colors cursor-help"
          >
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span className="font-mono text-emerald-400 font-bold">
              {savedUpdates}
            </span>
            <span className="text-muted-foreground uppercase tracking-wider">
              Updates Prevented
            </span>
          </Badge>
        </div>
      )}

      <CardContent className="pt-12 pb-10 flex flex-col items-center justify-center relative z-10 space-y-8">
        <button
          onClick={handleHeartClick}
          disabled={isLikesLoading}
          className={cn(
            "relative group transition-all duration-300 ease-elastic focus:outline-none",
            isLiked
              ? "scale-110"
              : "scale-100 opacity-60 hover:opacity-100 hover:scale-105"
          )}
          aria-label={isLiked ? "Unlike" : "Like"}
        >
          {/* Glow effect behind heart */}
          <div
            className={cn(
              "absolute inset-0 blur-3xl rounded-full transition-opacity duration-500",
              isLiked
                ? "bg-red-500/30 opacity-100"
                : "bg-primary/0 opacity-0 group-hover:bg-primary/20 group-hover:opacity-100"
            )}
          />

          <span
            className={cn(
              "text-[8rem] leading-none select-none filter drop-shadow-xl block transition-transform duration-300",
              isLiked ? "animate-heart-beat grayscale-0" : "grayscale"
            )}
          >
            ❤️
          </span>
        </button>

        <div className="text-center space-y-1">
          <div className="text-5xl font-black tracking-tight text-white tabular-nums drop-shadow-md">
            {likesCount.toLocaleString()}
          </div>
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Global Likes
          </div>
        </div>

        <div className="w-full max-w-xs pt-4 border-t border-border/10">
          <ControlPanel addLog={addLog} />
        </div>
      </CardContent>
    </Card>
  )
}
