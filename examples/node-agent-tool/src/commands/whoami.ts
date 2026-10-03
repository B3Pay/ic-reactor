// Scenario 1, `whoami`: the principal calls go out as, from the client itself.
//
// `client.authState()` answers without a network call: `"signed-in"` with the
// key's principal for a client built with an Identity, `"anonymous"` with
// 2vxsx-fae for one built with `identity: "anonymous"`, which refuses writes.
import type { Context } from "../context.ts"
import { EXIT_CODES } from "../failure.ts"
import { rows } from "../output.ts"

export async function whoami(ctx: Context): Promise<number> {
  const { status, principal } = ctx.client.authState()
  const canWrite = status === "signed-in"
  ctx.out.result(
    {
      ok: true,
      command: "whoami",
      principal,
      status,
      canWrite,
      identity: { algorithm: ctx.caller.algorithm, source: ctx.caller.source },
      network: ctx.client.network,
    },
    rows([
      ["principal", principal],
      ["status", status],
      [
        "writes",
        canWrite ? "signed and sent" : "refused by the client before sending",
      ],
      ["identity", ctx.caller.source],
      ["network", ctx.client.network],
      ["root key", ctx.network.rootKey],
    ])
  )
  return EXIT_CODES.ok
}
