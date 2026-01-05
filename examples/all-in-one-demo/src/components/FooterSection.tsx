import { Button } from "@/components/ui/button"
import { Github, BookOpen, Copy, Check } from "lucide-react"
import { useState } from "react"

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
              <Github className="mr-2 h-5 w-5" />
              Star on GitHub
            </Button>

            <Button
              size="lg"
              variant="outline"
              className="border-slate-700 bg-slate-900/50 hover:bg-slate-800 hover:text-white font-medium"
              onClick={() =>
                window.open("https://b3pay.github.io/ic-reactor/v3/", "_blank")
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
