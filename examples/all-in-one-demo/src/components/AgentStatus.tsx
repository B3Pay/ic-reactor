import { useState } from "react"
import { useAgentState, useAuth } from "../lib/reactor"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  ShieldCheck,
  ShieldAlert,
  Copy,
  Check,
  Globe,
  Server,
  Fingerprint,
  LogOut,
  LogIn,
} from "lucide-react"

interface AgentStatusProps {
  addLog: (type: "optimistic" | "success" | "error", message: string) => void
}

export function AgentStatus({ addLog }: AgentStatusProps) {
  const { login, logout, principal, isAuthenticated, isAuthenticating } =
    useAuth()
  const agentState = useAgentState()
  const [copied, setCopied] = useState(false)

  const copyPrincipal = () => {
    if (principal) {
      navigator.clipboard.writeText(principal.toText())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleLogin = () => {
    login({
      onSuccess: () => {
        addLog("success", "Authenticated successfully via Internet Identity")
      },
      onError: (error) => {
        addLog("error", `Authentication failed: ${error}`)
      },
    })
  }

  const handleLogout = () => {
    logout()
    addLog("success", "Disconnected Identity")
  }

  return (
    <Card className="p-0 glass-strong border-primary/20 overflow-hidden relative shadow-2xl">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 pointer-events-none" />

      <CardHeader className="p-4 border-b border-border/40 bg-background/20 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-xl">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Agent Status & Identity
            </CardTitle>
            <CardDescription>
              Manage authentication and view connection details
            </CardDescription>
          </div>
          <Badge
            variant={isAuthenticated ? "default" : "outline"}
            className={`px-3 py-1 ${isAuthenticated ? "bg-success hover:bg-success/90 text-white" : "text-muted-foreground border-slate-700 bg-slate-900/50"}`}
          >
            {isAuthenticated ? (
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                </span>
                Authenticated
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-slate-500" />
                Anonymous
              </span>
            )}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 divide-y md:divide-y-0 md:divide-x divide-border/40">
          {/* Identity Section */}
          <div className="p-6 lg:col-span-4 space-y-6">
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Fingerprint className="w-4 h-4" />
                Current Identity
              </h3>

              <div className="bg-slate-950/50 rounded-lg border border-border/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Principal ID
                  </span>
                  {principal && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-white"
                      onClick={copyPrincipal}
                    >
                      {copied ? (
                        <Check className="w-3.5 h-3.5 text-success" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  )}
                </div>
                <div className="font-mono text-xs md:text-sm text-slate-200 break-all leading-relaxed">
                  {principal ? principal.toText() : "2vxsx-fae..."}
                </div>
                {!isAuthenticated && (
                  <div className="text-xs text-amber-500/80 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    You are currently using an anonymous identity
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Authorization Methods
              </h3>
              <div className="flex gap-3">
                {isAuthenticated ? (
                  <Button
                    variant="destructive"
                    className="w-full sm:w-auto gap-2 shadow-lg shadow-red-900/20"
                    onClick={handleLogout}
                  >
                    <LogOut className="w-4 h-4" />
                    Disconnect Identity
                  </Button>
                ) : (
                  <Button
                    className="w-full sm:w-auto gap-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white shadow-lg shadow-blue-900/20"
                    onClick={handleLogin}
                    disabled={isAuthenticating}
                  >
                    {isAuthenticating ? (
                      <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <LogIn className="w-4 h-4" />
                    )}
                    Login via Internet Identity
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Connection Details Section */}
          <div className="p-6 lg:col-span-3 bg-slate-900/20 space-y-6">
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Server className="w-4 h-4" />
                Connection State
              </h3>

              <div className="space-y-3">
                <StatusRow
                  label="Agent Initialized"
                  value={agentState.isInitialized}
                  activeText="Ready"
                  inactiveText="Pending"
                />
                <StatusRow
                  label="Network Sync"
                  value={!agentState.isInitializing}
                  activeText="Synced"
                  inactiveText="Syncing..."
                  loading={agentState.isInitializing}
                />
                <StatusRow
                  label="Errors"
                  value={!!agentState.error}
                  isError
                  activeText="Detected"
                  inactiveText="None"
                />
              </div>
            </div>

            <Separator className="bg-border/40" />

            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Globe className="w-4 h-4" />
                Environment
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950/40 p-2.5 rounded border border-border/30">
                  <div className="text-[10px] text-muted-foreground uppercase mb-1">
                    Network
                  </div>
                  <div className="text-sm font-medium flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${process.env.DFX_NETWORK === "local" ? "bg-amber-400" : "bg-green-400"}`}
                    />
                    {process.env.DFX_NETWORK === "local"
                      ? "Localhost"
                      : "Mainnet"}
                  </div>
                </div>
                <div className="bg-slate-950/40 p-2.5 rounded border border-border/30">
                  <div className="text-[10px] text-muted-foreground uppercase mb-1">
                    Backend Canister
                  </div>
                  <div
                    className="text-xs font-mono text-slate-300 truncate"
                    title={process.env.CANISTER_ID_BACKEND}
                  >
                    {process.env.CANISTER_ID_BACKEND || "Unknown"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function StatusRow({
  label,
  value,
  activeText,
  inactiveText,
  isError,
  loading,
}: any) {
  const isActive = value
  let displayColor = "text-slate-400"
  if (isError) {
    displayColor = isActive ? "text-red-400 font-bold" : "text-emerald-400" // None is good
  } else {
    displayColor = isActive ? "text-emerald-400" : "text-amber-400"
  }

  return (
    <div className="flex items-center justify-between text-sm group">
      <span className="text-slate-400 group-hover:text-slate-300 transition-colors">
        {label}
      </span>
      <span className={`font-medium flex items-center gap-2 ${displayColor}`}>
        {loading && (
          <div className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
        {isActive ? activeText : inactiveText}
      </span>
    </div>
  )
}
