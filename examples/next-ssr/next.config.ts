import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `next dev` would otherwise write an AGENTS.md and a CLAUDE.md into this
  // folder when it detects a coding agent; the repository keeps its own.
  agentRules: false,
}

export default nextConfig
