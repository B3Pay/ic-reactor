import { TextEncoder, TextDecoder } from "util"
import { execFileSync } from "child_process"

function seedIcEnvCookie(): void {
  if (typeof document === "undefined") return

  try {
    const networkStatus = JSON.parse(
      execFileSync("icp", ["network", "status", "-e", "local", "--json"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      })
    )
    const canisterId = execFileSync(
      "icp",
      ["canister", "status", "hello_actor", "-e", "local", "-i"],
      {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }
    ).trim()

    const cookie = encodeURIComponent(
      `ic_root_key=${networkStatus.root_key}&PUBLIC_CANISTER_ID:hello_actor=${canisterId}`
    )
    document.cookie = `ic_env=${cookie}; Path=/; SameSite=Lax`
  } catch {
    // Tests that do not need a deployed local network can still run.
  }
}

seedIcEnvCookie()

global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder as any

import "fake-indexeddb/auto"
import "@testing-library/jest-dom/vitest"
