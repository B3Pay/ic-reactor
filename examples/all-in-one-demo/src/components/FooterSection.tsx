import { Button } from "@/components/ui/button"
import { BookOpen, Copy, Check } from "lucide-react"
import { useState } from "react"

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.53 2.87 8.38 6.84 9.74.5.1.68-.22.68-.5 0-.24-.01-.89-.01-1.75-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.1-1.49-1.1-1.49-.91-.63.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.3 9.3 0 0 1 12 7c.85 0 1.7.12 2.5.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.07.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .28.18.6.69.5A10.16 10.16 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z" />
    </svg>
  )
}

export function FooterSection() {
  const [copied, setCopied] = useState(false)
  const installCmd = "npm install @ic-reactor/react"

  const copyToClipboard = () => {
    navigator.clipboard.writeText(installCmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="mt-20 mb-8 border-t border-border/40 pt-16">
      <div className="bg-gradient-to-br from-slate-900/50 to-slate-950/50 border border-t-[1px] border-l-[1px] border-blue-500/20 rounded-2xl p-8 md:p-12 relative overflow-hidden group">
        {/* Ambient Glow Effects */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-500/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-purple-500/10 rounded-full blur-[80px] pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center max-w-2xl mx-auto space-y-8">
          <div className="space-y-4">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight text-white mb-2">
              Ready to Build?
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Experience the power of{" "}
              <span className="text-blue-400 font-semibold">ic-reactor v3</span>{" "}
              today. We've purely focused on developer experience so you can
              focus on building amazing dApps.
            </p>
            <p className="text-sm text-slate-400">
              Released in Beta. We'd love your feedback!
            </p>
          </div>

          {/* Installation Command */}
          <div className="w-full max-w-sm bg-slate-950/80 backdrop-blur-md border border-slate-800 rounded-lg p-3 flex items-center justify-between gap-3 shadow-xl">
            <code className="text-sm font-mono text-blue-300 pl-2">
              {installCmd}
            </code>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-slate-400 hover:text-white"
              onClick={copyToClipboard}
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <Button
              size="lg"
              className="bg-white text-slate-950 hover:bg-slate-200 font-semibold"
              onClick={() =>
                window.open("https://github.com/B3Pay/ic-reactor", "_blank")
              }
            >
              <GitHubIcon className="mr-2 h-5 w-5" />
              Star on GitHub
            </Button>

            <Button
              size="lg"
              variant="outline"
              className="border-slate-700 bg-slate-900/50 hover:bg-slate-800 hover:text-white font-medium"
              onClick={() =>
                window.open("https://ic-reactor.b3pay.net/v3/", "_blank")
              }
            >
              <BookOpen className="mr-2 h-5 w-5 text-blue-400" />
              Read Documentation
            </Button>
          </div>
        </div>
      </div>

      <div className="text-center mt-12 text-sm text-slate-600">
        <p>Built with ❤️ for the Internet Computer community.</p>
      </div>
    </section>
  )
}
