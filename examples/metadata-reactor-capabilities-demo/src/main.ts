import { MetadataReactor } from "@ic-reactor/candid"
import { ClientManager } from "@ic-reactor/core"
import { Principal } from "@icp-sdk/core/principal"
import { IDL } from "@icp-sdk/core/candid"
import { QueryClient } from "@tanstack/query-core"
import "./styles.css"

const clientManager = new ClientManager({
  queryClient: new QueryClient(),
  withLocalEnv: true,
})

const idlFactory = ({
  IDL,
}: {
  IDL: typeof import("@icp-sdk/core/candid").IDL
}) =>
  IDL.Service({
    greet: IDL.Func([IDL.Text, IDL.Nat], [IDL.Text], ["query"]),
    register_user: IDL.Func(
      [
        IDL.Record({
          username: IDL.Text,
          age: IDL.Nat8,
          tags: IDL.Vec(IDL.Text),
          marketing: IDL.Opt(IDL.Bool),
        }),
      ],
      [
        IDL.Variant({
          Ok: IDL.Record({
            id: IDL.Principal,
            created_at: IDL.Nat64,
          }),
          Err: IDL.Variant({
            ValidationError: IDL.Text,
            DuplicateUser: IDL.Record({ existing_id: IDL.Principal }),
          }),
        }),
      ],
      []
    ),
    get_profile: IDL.Func(
      [IDL.Principal],
      [
        IDL.Record({
          username: IDL.Text,
          stats: IDL.Record({
            logins: IDL.Nat,
            reputation: IDL.Int,
          }),
          badges: IDL.Vec(
            IDL.Variant({
              Gold: IDL.Null,
              Silver: IDL.Null,
              Bronze: IDL.Null,
            })
          ),
          preferences: IDL.Opt(
            IDL.Record({
              theme: IDL.Variant({ Dark: IDL.Null, Light: IDL.Null }),
              notifications: IDL.Bool,
            })
          ),
        }),
      ],
      ["query"]
    ),
  })

const reactor = new MetadataReactor({
  canisterId: "aaaaa-aa",
  clientManager,
  idlFactory,
  name: "metadata_capabilities",
})

type MethodName = "greet" | "register_user" | "get_profile"

const sampleArgs: Record<MethodName, unknown[]> = {
  greet: ["Metadata", BigInt(7)],
  register_user: [
    {
      username: "alice",
      age: 29,
      tags: ["ic", "reactor", "forms"],
      marketing: [true],
    },
  ],
  get_profile: [Principal.fromText("aaaaa-aa")],
}

const sampleOutputs: Record<MethodName, unknown> = {
  greet: "Hello, Metadata x7",
  register_user: {
    Ok: {
      id: Principal.fromText("2vxsx-fae"),
      created_at: BigInt(1720000000),
    },
  },
  get_profile: {
    username: "alice",
    stats: {
      logins: BigInt(42),
      reputation: BigInt(900),
    },
    badges: [{ Gold: null }, { Silver: null }],
    preferences: [{ theme: { Dark: null }, notifications: true }],
  },
}

const methodSelect = document.getElementById(
  "method-select"
) as HTMLSelectElement
const refreshBtn = document.getElementById("refresh-btn") as HTMLButtonElement
const hydrateBtn = document.getElementById("hydrate-btn") as HTMLButtonElement
const resolveBtn = document.getElementById("resolve-btn") as HTMLButtonElement

const inputMetaEl = document.getElementById("input-meta") as HTMLPreElement
const outputMetaEl = document.getElementById("output-meta") as HTMLPreElement
const hydrationEl = document.getElementById("hydration") as HTMLPreElement
const candidatesEl = document.getElementById("candidates") as HTMLPreElement
const resolvedOutputEl = document.getElementById(
  "resolved-output"
) as HTMLPreElement
const summaryEl = document.getElementById("summary") as HTMLPreElement

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "function") return "[Function]"
  if (typeof value === "bigint") return `${String(value)}n`
  if (value instanceof Uint8Array) return `[Uint8Array(${value.length})]`
  if (value instanceof Principal) return value.toText()
  if (value instanceof RegExp) return String(value)
  if (value instanceof Map) return Object.fromEntries(value)
  return value
}

function getMethodName(): MethodName {
  return methodSelect.value as MethodName
}

function getArgTypes(methodName: MethodName): IDL.Type[] {
  const field = reactor
    .getServiceInterface()
    ._fields.find(([name]) => name === methodName)

  if (!field) throw new Error(`Method ${methodName} not found in service`)
  return (field[1] as IDL.FuncClass).argTypes
}

async function renderMethod() {
  const methodName = getMethodName()

  const inputMeta = reactor.getInputMeta(methodName)
  const outputMeta = reactor.getOutputMeta(methodName)
  const variableCandidates = reactor.buildMethodVariableCandidates(methodName)

  inputMetaEl.textContent = JSON.stringify(inputMeta, replacer, 2)
  outputMetaEl.textContent = JSON.stringify(outputMeta, replacer, 2)
  candidatesEl.textContent = JSON.stringify(variableCandidates, replacer, 2)

  const allInput = reactor.getAllInputMeta() ?? {}
  const allOutput = reactor.getAllOutputMeta() ?? {}
  summaryEl.textContent = JSON.stringify(
    {
      methodCount: reactor.getMethodNames().length,
      methods: reactor.getMethodNames(),
      inputMetaMethods: Object.keys(allInput),
      outputMetaMethods: Object.keys(allOutput),
      sampleMethod: methodName,
    },
    replacer,
    2
  )

  hydrationEl.textContent = 'Click "Hydrate Sample Candid Args"'
  resolvedOutputEl.textContent = 'Click "Resolve Sample Output"'
}

async function hydrateSelectedMethod() {
  const methodName = getMethodName()
  const argTypes = getArgTypes(methodName)
  const args = sampleArgs[methodName]
  const candidArgsHex = toHex(IDL.encode(argTypes, args))

  const hydrated = await reactor.buildForMethod(methodName, { candidArgsHex })
  hydrationEl.textContent = JSON.stringify(
    {
      candidArgsHex,
      hydration: hydrated.hydration,
      defaults: hydrated.meta.defaults,
      argCount: hydrated.meta.argCount,
    },
    replacer,
    2
  )
}

function resolveSampleOutput() {
  const methodName = getMethodName()
  const outputMeta = reactor.getOutputMeta(methodName)
  if (!outputMeta) {
    resolvedOutputEl.textContent = `No output metadata for ${methodName}`
    return
  }

  const resolved = outputMeta.resolve(sampleOutputs[methodName])
  resolvedOutputEl.textContent = JSON.stringify(resolved, replacer, 2)
}

const methods = reactor
  .getMethodNames()
  .filter(
    (name): name is MethodName =>
      name === "greet" || name === "register_user" || name === "get_profile"
  )

methodSelect.innerHTML = methods
  .map((methodName) => `<option value="${methodName}">${methodName}</option>`)
  .join("")

refreshBtn.addEventListener("click", () => {
  void renderMethod()
})
methodSelect.addEventListener("change", () => {
  void renderMethod()
})
hydrateBtn.addEventListener("click", () => {
  void hydrateSelectedMethod()
})
resolveBtn.addEventListener("click", () => {
  resolveSampleOutput()
})

void renderMethod()
