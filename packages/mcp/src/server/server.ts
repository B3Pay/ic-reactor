// The MCP server: tools/list and tools/call over the interface loader and an
// ic-reactor client.
//
// Reads go out at once. A write (an update or a oneway) goes out only when
// all of these hold, and each refusal says which did not:
//
// - the server has an identity (`--identity`); the anonymous client refuses
//   writes before sending them in any case;
// - the canister is listed with `--canister`, so the person chose it;
// - its interface is certified metadata or a .did the person gave, never the
//   uncertified tmp hack: a call built from a replica's unproven answer could
//   encode something other than what the person reads;
// - the client can show a form (MCP form elicitation), and the person ticks
//   "Send this call" and accepts the call shown in full: canister, method,
//   caller, network, the arguments as Candid text, and the sha256 of the
//   bytes that are sent.
//
// A certified read goes out as the anonymous principal, never with the key.
// It is a replicated call, which the IC runs as whatever the canister's
// module exports under that name: the interface's `query` is the canister's
// own claim (or, for the tmp hack, one replica's), so a method it calls a
// query could be an update that would otherwise act as the caller unasked.
//
// One approval is asked at a time, and the call it approves holds the turn
// until it settles, so two writes never race each other.
import { createHash } from "node:crypto"
import type { Canister, Client } from "@ic-reactor/core"
import {
  Server,
  type CallToolResult,
  type ServerContext,
  type Tool,
} from "@modelcontextprotocol/server"
import { candidArgsText, candidName } from "../candid/candid-text.ts"
import {
  argsFromInput,
  inputShape,
  methodInput,
  resultArms,
  signatureText,
  type InputIssue,
} from "../candid/json.ts"
import { checkCanisterId } from "../interface/ids.ts"
import type {
  CanisterInterface,
  InterfaceLoader,
  LoadOptions,
  LoadResult,
  MethodInfo,
} from "../interface/types.ts"
import type { ListedCanister } from "../options.ts"
import {
  APPROVAL_TIMEOUT_MS,
  MAX_APPROVAL_ARGS_CHARS,
  approvalMessage,
  askApproval,
  provenanceText,
} from "./approval.ts"
import { toolNames } from "./naming.ts"
import {
  errorResult,
  failureText,
  jsonText,
  replyJson,
  textResult,
} from "./results.ts"
import {
  CALL,
  DESCRIBE_METHOD,
  GENERIC_NAMES,
  INSTRUCTIONS,
  LIST_METHODS,
  QUERY,
  WHOAMI,
} from "./tools.ts"

export interface ServerDeps {
  /** The client calls go through: `createClient`, or `createTestClient` in tests. */
  readonly client: Client
  /**
   * An anonymous client (`identity: "anonymous"`), for certified reads only:
   * a replicated call made with the key could run an update the interface
   * calls a query, as the caller and without approval.
   */
  readonly anonymousClient: Client
  readonly loader: InterfaceLoader
  /** The canisters named with `--canister`. */
  readonly canisters: readonly ListedCanister[]
  /** Where the caller's key came from, for a person to read. */
  readonly callerSource: string
  /** The network, for a person to read. */
  readonly networkLabel: string
  readonly version: string
  readonly approvalTimeoutMs?: number
  /** A line for the person's log (stderr): never the protocol's stdout. */
  readonly log?: (line: string) => void
}

/** The longest signature one line of list_methods or a tool description shows. */
const MAX_SIGNATURE_CHARS = 600

type Method = (...args: unknown[]) => Promise<unknown>
/** A canister whose methods are known only at run time. */
type Actor = Record<string, Method>

const isWrite = (mode: MethodInfo["mode"]): mode is "update" | "oneway" =>
  mode === "update" || mode === "oneway"

/** A canister to call: its id, and its `--canister` entry when it has one. */
interface Target {
  readonly id: string
  readonly listed: ListedCanister | undefined
}

export function createMcpServer(deps: ServerDeps): Server {
  const log = deps.log ?? (() => {})
  const server = new Server(
    { name: "ic-reactor-mcp", version: deps.version },
    {
      capabilities: { tools: { listChanged: true } },
      instructions: INSTRUCTIONS,
    }
  )

  /** The typed tools of the last tools/list: name to canister and method. */
  let typed = new Map<string, { canister: ListedCanister; method: string }>()
  /** A listed canister's interface id when its tools were last listed; null when it did not load. */
  const listedFrom = new Map<string, string | null>()
  let approving = false

  const anonymous = (): boolean =>
    deps.client.authState().status === "anonymous"
  const canApprove = (): boolean =>
    server.getClientCapabilities()?.elicitation?.form !== undefined

  /** Why a write to this canister is not sent, or `undefined` when it can be. */
  function writesOff(
    listed: ListedCanister | undefined,
    iface: CanisterInterface
  ): string | undefined {
    if (anonymous()) {
      return "this server calls as the anonymous principal; start it with --identity <pem file> to send updates"
    }
    if (listed === undefined) {
      return `updates go only to canisters named with --canister, and ${iface.canisterId} is not one`
    }
    if (iface.provenance.kind === "tmp_hack") {
      return `its interface came from ${provenanceText(iface.provenance)}, so no update is built from it; give its .did with --did ${listed.name}=<path>`
    }
    if (!canApprove()) {
      return "this MCP client cannot show an approval form (MCP form elicitation), so no update can be approved"
    }
    return undefined
  }

  /** Tells the client to list tools again when a listed canister's interface changed. */
  function noteInterface(target: Target, result: LoadResult): void {
    if (target.listed === undefined || !listedFrom.has(target.id)) return
    const now = result.ok ? result.iface.interfaceId : null
    if (listedFrom.get(target.id) === now) return
    listedFrom.set(target.id, now)
    server.sendToolListChanged().catch(() => {})
  }

  async function listTools(): Promise<Tool[]> {
    const loads = await Promise.all(
      deps.canisters.map((canister) => deps.loader.load(canister.id))
    )
    const entries: { canister: ListedCanister; method: MethodInfo }[] = []
    deps.canisters.forEach((canister, i) => {
      const result = loads[i]
      listedFrom.set(canister.id, result.ok ? result.iface.interfaceId : null)
      if (!result.ok) {
        log(`${canister.name} (${canister.id}): ${result.message}`)
        return
      }
      const writable = writesOff(canister, result.iface) === undefined
      for (const method of result.iface.methods.values()) {
        if (isWrite(method.mode) && !writable) continue
        entries.push({ canister, method })
      }
    })
    const names = toolNames(
      entries.map(({ canister, method }) => ({
        canister: canister.name,
        method: method.name,
      })),
      GENERIC_NAMES
    )
    const next = new Map<string, { canister: ListedCanister; method: string }>()
    const tools = [WHOAMI, LIST_METHODS, DESCRIBE_METHOD, QUERY]
    if (!anonymous() && canApprove() && deps.canisters.length > 0) {
      tools.push(CALL)
    }
    entries.forEach(({ canister, method }, i) => {
      next.set(names[i], { canister, method: method.name })
      tools.push(typedTool(names[i], canister, method))
    })
    typed = next
    return tools
  }

  async function callTool(
    name: string,
    input: Record<string, unknown>,
    ctx: ServerContext
  ): Promise<CallToolResult> {
    switch (name) {
      case WHOAMI.name:
        return whoami()
      case LIST_METHODS.name: {
        const read = readInput(input, { canister: "string" })
        if (!read.ok) return errorResult(read.message)
        return listMethods(read.values.canister as string)
      }
      case DESCRIBE_METHOD.name: {
        const read = readInput(input, { canister: "string", method: "string" })
        if (!read.ok) return errorResult(read.message)
        return describeMethod(
          read.values.canister as string,
          read.values.method as string
        )
      }
      case QUERY.name:
      case CALL.name: {
        const read = readInput(
          input,
          name === QUERY.name
            ? {
                canister: "string",
                method: "string",
                args: "object?",
                certified: "boolean?",
              }
            : { canister: "string", method: "string", args: "object?" }
        )
        if (!read.ok) return errorResult(read.message)
        const target = targetOf(read.values.canister as string)
        if (typeof target === "string") return errorResult(target)
        return run(
          target,
          read.values.method as string,
          read.values.args ?? {},
          {
            tool: name === QUERY.name ? "query" : "call",
            certified: read.values.certified === true,
          },
          ctx
        )
      }
    }
    if (!typed.has(name)) await listTools()
    const entry = typed.get(name)
    if (entry === undefined) {
      return errorResult(
        `There is no tool ${name}. list_methods shows a canister's methods, and query and call run them.`
      )
    }
    return run(
      { id: entry.canister.id, listed: entry.canister },
      entry.method,
      input,
      { tool: "typed", certified: false },
      ctx
    )
  }

  /** A listed name or a canister id; a string is the reason it is neither. */
  function targetOf(text: string): Target | string {
    const trimmed = text.trim()
    const byName = deps.canisters.find((canister) => canister.name === trimmed)
    if (byName !== undefined) return { id: byName.id, listed: byName }
    // Principal text is lower case; its checksum still decides.
    const checked = checkCanisterId(trimmed.toLowerCase())
    if (!checked.ok) return checked.message
    return {
      id: checked.id,
      listed: deps.canisters.find((canister) => canister.id === checked.id),
    }
  }

  async function load(
    target: Target,
    options?: LoadOptions
  ): Promise<
    { ok: true; iface: CanisterInterface } | { ok: false; text: string }
  > {
    const result = await deps.loader.load(target.id, options)
    noteInterface(target, result)
    if (result.ok) return result
    const lines = [
      `Could not read the interface of ${target.id}: ${result.message}`,
    ]
    for (const diagnostic of result.diagnostics ?? []) {
      lines.push(`- ${diagnostic.code}: ${diagnostic.message}`)
    }
    return { ok: false, text: lines.join("\n") }
  }

  async function run(
    target: Target,
    methodName: string,
    argsInput: unknown,
    how: {
      readonly tool: "query" | "call" | "typed"
      readonly certified: boolean
    },
    ctx: ServerContext
  ): Promise<CallToolResult> {
    const loaded = await load(target)
    if (!loaded.ok) return errorResult(loaded.text)
    let { iface } = loaded
    let method = iface.methods.get(methodName)
    if (method === undefined)
      return errorResult(noMethodText(iface, methodName))
    const write = isWrite(method.mode)
    if (write && how.tool !== "query") {
      // A write is built from the interface of the module installed now, not
      // from a cache that may predate an upgrade.
      const confirmed = await load(target, { fresh: true })
      if (!confirmed.ok) return errorResult(`Not sent. ${confirmed.text}`)
      iface = confirmed.iface
      method = iface.methods.get(methodName)
      if (method === undefined || !isWrite(method.mode)) {
        return errorResult(
          `Not sent: the canister was upgraded, and ${candidName(methodName)} is no longer the update it was. list_methods shows its methods now.`
        )
      }
    }
    if (write && how.tool === "query") {
      return errorResult(
        `${candidName(methodName)} is ${method.mode === "oneway" ? "a oneway method" : "an update"}: the query tool runs only queries. Use call, which asks the person to approve it.`
      )
    }
    if (how.certified && method.mode === "composite_query") {
      return errorResult(
        `${candidName(methodName)} is a composite query, which has no certified path: run it with certified: false.`
      )
    }

    const off = write ? writesOff(target.listed, iface) : undefined
    if (off !== undefined) return errorResult(`Not sent: ${off}.`)

    const shape = inputShape(method.args)
    const converted = argsFromInput(method.args, shape, argsInput)
    if (!converted.ok)
      return errorResult(issuesText(methodName, converted.issues))
    const { values } = converted

    // A certified read is a replicated call: made as the anonymous principal,
    // whatever the method turns out to be, it cannot act as the caller.
    const through = !write && how.certified ? deps.anonymousClient : deps.client
    const canister = through.canister<Actor>(iface.actor, {
      id: iface.canisterId,
      certified: how.certified,
    })
    const arms = resultArms(method.results)
    if (!write) {
      try {
        const reply = await methodOf(canister, method.name)(...values)
        const json = jsonText(replyJson(method.results, arms?.ok, reply))
        return textResult(
          arms === undefined ? json : `The canister answered Ok:\n${json}`
        )
      } catch (error) {
        return errorResult(failureText(error, false, arms?.err))
      }
    }

    if (approving) {
      return errorResult(
        "Not sent: another update is waiting for the person's approval or still running. Wait for its answer, then try again."
      )
    }
    approving = true
    try {
      return await sendWrite({ target, iface, method, values, canister, ctx })
    } finally {
      approving = false
    }
  }

  async function sendWrite({
    target,
    iface,
    method,
    values,
    canister,
    ctx,
  }: {
    readonly target: Target
    readonly iface: CanisterInterface
    readonly method: MethodInfo
    readonly values: unknown[]
    readonly canister: Canister<Actor>
    readonly ctx: ServerContext
  }): Promise<CallToolResult> {
    const arms = resultArms(method.results)
    // The bytes the call path itself encodes: the value for one argument,
    // the tuple for several, nothing for none.
    const vars =
      values.length === 0 ? undefined : values.length === 1 ? values[0] : values
    let bytes: Uint8Array
    try {
      bytes = deps.client.encode(canister, method.name, vars as never)
    } catch (error) {
      return errorResult(failureText(error, false, undefined))
    }
    const argsText = candidArgsText(method.args, values, { width: 72 })
    if (argsText.length > MAX_APPROVAL_ARGS_CHARS) {
      return errorResult(
        `Not sent: the arguments are ${argsText.length} characters of Candid, too long to show the person for approval (at most ${MAX_APPROVAL_ARGS_CHARS}).`
      )
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex")
    const oneway = method.mode === "oneway"
    const message = approvalMessage({
      canisterId: iface.canisterId,
      canisterName: target.listed?.name,
      method: method.name,
      mode: oneway ? "oneway" : "update",
      caller: deps.client.caller(),
      callerSource: deps.callerSource,
      network: deps.networkLabel,
      argsText,
      argBytes: bytes.length,
      argSha256: sha256,
      provenance: iface.provenance,
    })
    const what = `${candidName(method.name)} on ${iface.canisterId} (arguments sha256 ${sha256})`
    log(`asking the person to approve ${what}`)
    const outcome = await askApproval(
      ctx,
      message,
      deps.approvalTimeoutMs ?? APPROVAL_TIMEOUT_MS
    )
    if (!outcome.approved) {
      log(`not sent: ${what}: ${outcome.reason}`)
      return errorResult(
        `Not sent: ${outcome.reason}. Do not send it again unless the person asks you to.`
      )
    }
    // The form named the module (or .did file) the call was built for. The
    // person may have taken minutes: confirm it is still the one installed,
    // as an upgrade in between could read the same bytes differently.
    const now = await load(target, { fresh: true })
    if (!now.ok) {
      log(`not sent: ${what}: the interface could not be confirmed again`)
      return errorResult(
        `Not sent: the person approved it, but the canister's interface could not be confirmed again before sending. ${now.text}`
      )
    }
    if (!sameInterface(iface, now.iface)) {
      log(`not sent: ${what}: the canister changed while the person decided`)
      return errorResult(
        "Not sent: the canister was upgraded (or its .did file changed) while the person was deciding, so the call they approved was built for an interface that is no longer the one in use. Ask them before you try again."
      )
    }
    if (ctx.mcpReq.signal.aborted) {
      log(`not sent: ${what}: the tool call was cancelled`)
      return errorResult("Not sent: the tool call was cancelled.")
    }
    log(`approved; sending ${what}`)
    try {
      const reply = await methodOf(canister, method.name)(...values)
      log(`sent ${what}`)
      if (oneway) {
        return textResult(
          "Approved and sent. A oneway method sends no reply, so whether it ran is not known."
        )
      }
      return textResult(
        `Approved and sent. The canister answered${arms === undefined ? "" : " Ok"}:\n${jsonText(replyJson(method.results, arms?.ok, reply))}`
      )
    } catch (error) {
      log(`failed: ${what}`)
      return errorResult(failureText(error, true, arms?.err))
    }
  }

  function whoami(): CallToolResult {
    const lines = [
      `Caller: ${deps.client.caller()}, ${deps.callerSource}`,
      ...(anonymous()
        ? []
        : [
            "Certified reads (query with certified: true) go out as the anonymous principal, never with the key.",
          ]),
      `Network: ${deps.networkLabel}`,
      canApprove()
        ? "Approvals: this client can show the approval form, so an update can be sent once the person approves it."
        : "Approvals: this client cannot show an approval form (MCP form elicitation), so no update can be sent.",
    ]
    if (deps.canisters.length === 0) {
      lines.push(
        "Listed canisters: none. Queries work on any canister; updates need one named with --canister <name>=<id>."
      )
    } else {
      lines.push(
        "Listed canisters (their methods have tools, and they take updates):"
      )
      for (const canister of deps.canisters) {
        lines.push(`- ${canister.name}: ${canister.id}`)
      }
    }
    return textResult(lines.join("\n"))
  }

  async function listMethods(canisterText: string): Promise<CallToolResult> {
    const target = targetOf(canisterText)
    if (typeof target === "string") return errorResult(target)
    const loaded = await load(target)
    if (!loaded.ok) return errorResult(loaded.text)
    const { iface } = loaded
    const off = writesOff(target.listed, iface)
    const lines = [
      `Canister ${iface.canisterId}${target.listed === undefined ? "" : ` (${target.listed.name})`}`,
      `Interface: ${provenanceText(iface.provenance)}`,
      `Interface id: ${iface.interfaceId}`,
      off === undefined
        ? "Updates: each is sent once the person approves it."
        : `Updates: not sent, as ${off}.`,
      "",
      `${iface.methods.size} methods, in Candid (a method not marked query or composite_query is an update):`,
    ]
    for (const method of iface.methods.values()) {
      lines.push(
        `- ${candidName(method.name)} : ${signatureText(method, { maxChars: MAX_SIGNATURE_CHARS })}`
      )
    }
    if (iface.omitted.length > 0) {
      lines.push("", "Left out, as the schema loader cannot use them:")
      for (const omitted of iface.omitted) {
        lines.push(`- ${omitted.kind} ${omitted.name}: ${omitted.reason}`)
      }
    }
    return textResult(lines.join("\n"))
  }

  async function describeMethod(
    canisterText: string,
    methodName: string
  ): Promise<CallToolResult> {
    const target = targetOf(canisterText)
    if (typeof target === "string") return errorResult(target)
    const loaded = await load(target)
    if (!loaded.ok) return errorResult(loaded.text)
    const { iface } = loaded
    const method = iface.methods.get(methodName)
    if (method === undefined)
      return errorResult(noMethodText(iface, methodName))
    const input = methodInput(method.args)
    const did = await deps.loader.methodDid(iface, method.name)
    const lines = [
      `${candidName(method.name)}: ${method.mode} method of ${iface.canisterId}${target.listed === undefined ? "" : ` (${target.listed.name})`}`,
    ]
    if (isWrite(method.mode)) {
      const off = writesOff(target.listed, iface)
      lines.push(
        off === undefined
          ? "Sent with call once the person approves it."
          : `Not sent, as ${off}.`
      )
    }
    if (method.doc !== undefined) {
      lines.push(
        "",
        "Its doc comment, written by the canister's authors:",
        method.doc
      )
    }
    lines.push(
      "",
      "Candid (the method and every type it uses):",
      did.ok ? did.did : `(not available: ${did.message})`,
      "",
      `The args object (${shapeText(input.shape)}), as JSON Schema${input.complete ? "" : ", shortened where it was too large; the Candid above is complete"}:`,
      JSON.stringify(input.schema, null, 2)
    )
    return textResult(lines.join("\n"))
  }

  function typedTool(
    name: string,
    canister: ListedCanister,
    method: MethodInfo
  ): Tool {
    const input = methodInput(method.args)
    const write = isWrite(method.mode)
    const lines = [
      write
        ? `Update ${candidName(method.name)} of canister ${canister.name} (${canister.id}). It is sent only after the person approves this exact call in the client; if they decline, nothing is sent.`
        : `Query ${candidName(method.name)} of canister ${canister.name} (${canister.id}). It runs at once and changes nothing.`,
      `Candid: ${signatureText(method, { maxChars: MAX_SIGNATURE_CHARS })}`,
    ]
    if (!input.complete) {
      lines.push(
        "The input schema is shortened; describe_method shows the method's whole Candid."
      )
    }
    return {
      name,
      title: `${canister.name}: ${candidName(method.name)}`,
      description: lines.join("\n"),
      inputSchema: input.schema as Tool["inputSchema"],
      annotations: write
        ? {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: true,
          }
        : { readOnlyHint: true, openWorldHint: true },
    }
  }

  server.setRequestHandler("tools/list", async () => ({
    tools: await listTools(),
  }))
  server.setRequestHandler("tools/call", async (request, ctx) => {
    const { name, arguments: input } = request.params
    try {
      return await callTool(name, input ?? {}, ctx)
    } catch (error) {
      log(
        `tool ${name} failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`
      )
      return errorResult(
        `The server failed to run ${name}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  })
  return server
}

/** A canister method as an own property, never one of Object.prototype's. */
function methodOf(canister: object, name: string): Method {
  const descriptor = Object.getOwnPropertyDescriptor(canister, name)
  if (typeof descriptor?.value !== "function") {
    throw new Error(`the client has no method ${name} for this canister`)
  }
  return descriptor.value as Method
}

function noMethodText(iface: CanisterInterface, name: string): string {
  const omitted = iface.omitted.find(
    (entry) => entry.kind === "method" && entry.name === name
  )
  if (omitted !== undefined) {
    return `${name} cannot be called here: ${omitted.reason}.`
  }
  const names = [...iface.methods.keys()]
  const shown = names.slice(0, 40).join(", ")
  return `${iface.canisterId} has no method ${name}. Its ${names.length} methods: ${shown}${names.length > 40 ? ", …" : ""}.`
}

function issuesText(method: string, issues: readonly InputIssue[]): string {
  const shown = issues
    .slice(0, 20)
    .map((issue) => `- ${issue.path}: ${issue.message}`)
  if (issues.length > 20) shown.push(`- … and ${issues.length - 20} more`)
  return `Not sent: the arguments of ${method} do not fit its Candid types:\n${shown.join("\n")}\ndescribe_method shows what each one takes.`
}

/** The same interface, read from the same module or file, as when the person was asked. */
function sameInterface(
  before: CanisterInterface,
  after: CanisterInterface
): boolean {
  return (
    before.interfaceId === after.interfaceId &&
    before.provenance.kind === after.provenance.kind &&
    moduleHashOf(before) === moduleHashOf(after)
  )
}

function moduleHashOf(iface: CanisterInterface): string | null {
  return iface.provenance.kind === "file" ? null : iface.provenance.moduleHash
}

function shapeText(shape: ReturnType<typeof methodInput>["shape"]): string {
  switch (shape.kind) {
    case "none":
      return "the method takes no arguments: {}"
    case "fields":
      return "the fields of its one record argument"
    case "positional":
      return shape.count === 1
        ? "its one argument as arg0"
        : `its ${shape.count} arguments as arg0 to arg${shape.count - 1}`
  }
}

type Expect = "string" | "object?" | "boolean?"

/** The generic tools' own inputs, checked before anything is read. */
function readInput(
  input: Record<string, unknown>,
  spec: Record<string, Expect>
):
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; message: string } {
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(spec, key)) {
      return {
        ok: false,
        message: `Unknown input ${JSON.stringify(key)}: this tool takes ${Object.keys(spec).join(", ")}. A method's own arguments go in args.`,
      }
    }
  }
  const values: Record<string, unknown> = {}
  for (const [key, expect] of Object.entries(spec)) {
    const value = Object.hasOwn(input, key) ? input[key] : undefined
    const optional = expect.endsWith("?")
    if (value === undefined || value === null) {
      if (!optional) return { ok: false, message: `${key} is required.` }
      continue
    }
    const type = expect.replace("?", "")
    const actual = Array.isArray(value) ? "array" : typeof value
    if (actual !== type) {
      return { ok: false, message: `${key} is a ${type}, got ${actual}.` }
    }
    values[key] = value
  }
  return { ok: true, values }
}
