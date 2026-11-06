// The person's approval of one update, asked through the MCP client (form
// elicitation): the call is shown in full, and it is sent only when the person
// ticks "Send this call" and accepts. Declining, closing the form, a timeout,
// an error or a client that cannot ask all mean the call is not sent.
import type {
  ElicitRequestFormParams,
  ServerContext,
} from "@modelcontextprotocol/server"
import { candidName } from "../candid/candid-text.ts"
import type { InterfaceProvenance } from "../interface/types.ts"

/** How long the person has to answer before the call is dropped. */
export const APPROVAL_TIMEOUT_MS = 10 * 60_000

/** The longest Candid argument text shown; a call whose arguments do not fit is refused, never cut. */
export const MAX_APPROVAL_ARGS_CHARS = 20_000

/**
 * The longest method name shown, as Candid; a call to a method whose name is
 * longer is refused, so that the arguments come near the top of the form.
 */
export const MAX_APPROVAL_METHOD_CHARS = 200

/** The form: one box, unticked until the person ticks it. */
export const APPROVAL_SCHEMA: ElicitRequestFormParams["requestedSchema"] = {
  type: "object",
  properties: {
    approve: {
      type: "boolean",
      title: "Send this call",
      description: "Tick to sign and send exactly the call shown above.",
      default: false,
    },
  },
  required: ["approve"],
}

/** Everything the person sees about the call. */
export interface ApprovalFacts {
  readonly canisterId: string
  /** The `--canister` name, when the canister has one. */
  readonly canisterName: string | undefined
  readonly method: string
  readonly mode: "update" | "oneway"
  /** The principal that signs. */
  readonly caller: string
  /** Where its key came from. */
  readonly callerSource: string
  readonly network: string
  /** The arguments as Candid text. */
  readonly argsText: string
  readonly argBytes: number
  readonly argSha256: string
  readonly provenance: InterfaceProvenance
}

/**
 * The message of the approval form. The facts and the arguments are in a
 * code fence: a client that renders the message as Markdown shows them as
 * they are, and no line of them can close the fence early.
 */
export function approvalMessage(facts: ApprovalFacts): string {
  const canister =
    facts.canisterName === undefined
      ? facts.canisterId
      : `${facts.canisterId} (${facts.canisterName})`
  const call = [
    `Canister: ${canister}`,
    `Method:   ${candidName(facts.method)}`,
    `Caller:   ${facts.caller}, ${facts.callerSource}`,
    `Network:  ${facts.network}`,
    "",
    "Arguments, in Candid:",
    facts.argsText,
    "",
    `They encode to ${facts.argBytes} bytes, sha256 ${facts.argSha256}.`,
    `Interface: ${provenanceText(facts.provenance)}.`,
  ].join("\n")
  const fence = fenceFor(call)
  const lines = [
    `Send this ${facts.mode === "oneway" ? "oneway call" : "update call"} to the Internet Computer?`,
    "",
    fence,
    call,
    fence,
  ]
  if (facts.mode === "oneway") {
    lines.push(
      "",
      "A oneway method sends no reply, so the server cannot tell whether it ran."
    )
  }
  lines.push("", "Nothing is sent unless you tick “Send this call” and accept.")
  return lines.join("\n")
}

/**
 * A backtick fence longer than any run of backticks that starts a line of
 * `text` (after up to three spaces), so that no line of it closes the fence.
 */
function fenceFor(text: string): string {
  let longest = 0
  for (const match of text.matchAll(/^ {0,3}(`+)/gm)) {
    longest = Math.max(longest, match[1]?.length ?? 0)
  }
  return "`".repeat(Math.max(3, longest + 1))
}

/** Where an interface came from, in a few words. */
export function provenanceText(provenance: InterfaceProvenance): string {
  switch (provenance.kind) {
    case "metadata":
      return provenance.moduleHash === null
        ? "the canister's certified candid:service metadata"
        : `the certified candid:service metadata of module ${provenance.moduleHash}`
    case "tmp_hack":
      return `the canister's own uncertified answer to __get_candid_interface_tmp_hack (its candid:service metadata is ${provenance.reason === "absent" ? "absent" : "readable by its controllers only"})`
    case "file":
      return `the .did file ${provenance.path}, given with --did and not checked against the canister`
  }
}

export type ApprovalOutcome =
  | { readonly approved: true }
  | { readonly approved: false; readonly reason: string }

/** Asks the person through the client, and says whether they approved. Never throws. */
export async function askApproval(
  ctx: ServerContext,
  message: string,
  timeoutMs: number = APPROVAL_TIMEOUT_MS
): Promise<ApprovalOutcome> {
  let result
  try {
    result = await ctx.mcpReq.elicitInput(
      { mode: "form", message, requestedSchema: APPROVAL_SCHEMA },
      { timeout: timeoutMs, signal: ctx.mcpReq.signal }
    )
  } catch (error) {
    return {
      approved: false,
      reason: `the approval was not answered (${error instanceof Error ? error.message : String(error)})`,
    }
  }
  switch (result.action) {
    case "accept":
      return result.content?.["approve"] === true
        ? { approved: true }
        : {
            approved: false,
            reason:
              "the person accepted the form without ticking “Send this call”",
          }
    case "decline":
      return { approved: false, reason: "the person declined it" }
    default:
      return { approved: false, reason: "the person closed the request" }
  }
}
