// The interface server functions. The declarations (method, input
// validation, result types) are the contract; B4 implements the handlers.
// Server-only code lives in *.server.ts files imported inside the handlers.
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { checkCanisterId } from "../lib/ids.ts"
import type { CanisterInterface, InterfacePayload } from "./types.ts"

// The longest canonical principal text is 63 characters.
const canisterIdText = z.string().max(64)

const canisterInput = z.object({ canisterId: canisterIdText })

const projectInput = z.object({
  canisterId: canisterIdText,
  methods: z.array(z.string().min(1).max(1024)).min(1).max(1000),
})

export type GenerateModuleResult =
  | { ok: true; module: string; omitted: CanisterInterface["omitted"] }
  | { ok: false; message: string }

export type ProjectInterfaceResult =
  { ok: true; did: string; methods: string[] } | { ok: false; message: string }

/** A live canister's interface: certified metadata, compiled on the server. */
export const fetchInterface = createServerFn({ method: "GET" })
  .validator(canisterInput)
  .handler(async ({ data }): Promise<InterfacePayload> => {
    const id = checkCanisterId(data.canisterId)
    if (!id.ok) {
      return {
        ok: false,
        canisterId: data.canisterId,
        code: id.code,
        message: id.message,
      }
    }
    return {
      ok: false,
      canisterId: data.canisterId,
      code: "network",
      message: "not implemented",
    }
  })

/** The TypeScript module `didToModule` writes for a live canister's interface. */
export const generateModule = createServerFn({ method: "GET" })
  .validator(canisterInput)
  .handler(async ({ data }): Promise<GenerateModuleResult> => {
    const id = checkCanisterId(data.canisterId)
    if (!id.ok) return { ok: false, message: id.message }
    return { ok: false, message: "not implemented" }
  })

/** A live canister's interface projected to some of its methods (`projectDid`). */
export const projectInterface = createServerFn({ method: "POST" })
  .validator(projectInput)
  .handler(async ({ data }): Promise<ProjectInterfaceResult> => {
    const id = checkCanisterId(data.canisterId)
    if (!id.ok) return { ok: false, message: id.message }
    return { ok: false, message: "not implemented" }
  })
