import initParser, { didToJs, didToTs, validateIDL } from "@ic-reactor/parser"
import { useEffect, useMemo, useState } from "react"

type RuntimeTarget = "react" | "core"
type ReactorClass =
  | "Reactor"
  | "DisplayReactor"
  | "CandidReactor"
  | "CandidDisplayReactor"
  | "MetadataDisplayReactor"
type OutputFile = "generated.ts" | "index.ts"

interface PlaygroundOptions {
  canisterName: string
  clientManagerPath: string
  includeReactor: boolean
  runtimeTarget: RuntimeTarget
  reactorClass: ReactorClass
  canisterId: string
}

interface GeneratedOutput {
  generatedTs: string
  indexTs: string
  methodCount: number
  typeCount: number
}

const DEFAULT_CANDID = `/// Backend service used by the frontend.
type Account = record {
  /// Principal that owns the account.
  owner : principal;
  /// Optional ledger subaccount.
  subaccount : opt blob;
};

type TransferArg = record {
  to : Account;
  amount : nat;
  memo : opt blob;
};

type TransferResult = variant {
  Ok : nat;
  Err : text;
};

service : {
  /// Read the balance for an account.
  icrc1_balance_of : (Account) -> (nat) query;
  /// Transfer tokens to another account.
  icrc1_transfer : (TransferArg) -> (TransferResult);
}`

const DEFAULT_OPTIONS: PlaygroundOptions = {
  canisterName: "backend",
  clientManagerPath: "../../clients",
  includeReactor: true,
  runtimeTarget: "react",
  reactorClass: "DisplayReactor",
  canisterId: "",
}

const REACTOR_CLASSES: ReactorClass[] = [
  "DisplayReactor",
  "Reactor",
  "CandidReactor",
  "CandidDisplayReactor",
  "MetadataDisplayReactor",
]

function App() {
  const [parserReady, setParserReady] = useState(false)
  const [parserError, setParserError] = useState<string | null>(null)
  const [candid, setCandid] = useState(DEFAULT_CANDID)
  const [options, setOptions] = useState<PlaygroundOptions>(DEFAULT_OPTIONS)
  const [activeFile, setActiveFile] = useState<OutputFile>("generated.ts")
  const [copiedFile, setCopiedFile] = useState<OutputFile | null>(null)

  useEffect(() => {
    let active = true

    initParser()
      .then(() => {
        if (active) setParserReady(true)
      })
      .catch((error: unknown) => {
        if (!active) return
        setParserError(error instanceof Error ? error.message : String(error))
      })

    return () => {
      active = false
    }
  }, [])

  const output = useMemo(() => {
    if (!parserReady) return null

    try {
      const generated = generatePreview(candid, options)
      return { generated, error: null }
    } catch (error) {
      return {
        generated: null,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }, [candid, options, parserReady])

  const generated = output?.generated ?? null
  const outputError = parserError ?? output?.error ?? null
  const visibleCode =
    activeFile === "generated.ts"
      ? (generated?.generatedTs ?? "")
      : (generated?.indexTs ?? "")

  const updateOption = <K extends keyof PlaygroundOptions>(
    key: K,
    value: PlaygroundOptions[K]
  ) => {
    setOptions((current) => ({ ...current, [key]: value }))
  }

  const copyActiveFile = async () => {
    if (!visibleCode) return
    await navigator.clipboard.writeText(visibleCode)
    setCopiedFile(activeFile)
    window.setTimeout(() => setCopiedFile(null), 1200)
  }

  return (
    <main className="shell">
      <section className="workspace">
        <div className="topbar">
          <div>
            <h1>Candid Codegen Playground</h1>
            <p>
              Write Candid and inspect the TypeScript-only generated output.
            </p>
          </div>
          <div className="status" data-state={outputError ? "error" : "ok"}>
            {parserReady
              ? outputError
                ? "Parse error"
                : "Generated"
              : "Loading parser"}
          </div>
        </div>

        <div className="optionGrid">
          <label>
            <span>Canister</span>
            <input
              value={options.canisterName}
              onChange={(event) =>
                updateOption("canisterName", event.target.value)
              }
              spellCheck={false}
            />
          </label>
          <label>
            <span>Client manager import</span>
            <input
              value={options.clientManagerPath}
              onChange={(event) =>
                updateOption("clientManagerPath", event.target.value)
              }
              spellCheck={false}
            />
          </label>
          <label>
            <span>Runtime</span>
            <select
              value={options.runtimeTarget}
              onChange={(event) =>
                updateOption(
                  "runtimeTarget",
                  event.target.value as RuntimeTarget
                )
              }
            >
              <option value="react">React hooks</option>
              <option value="core">Core reactor</option>
            </select>
          </label>
          <label>
            <span>Reactor class</span>
            <select
              value={options.reactorClass}
              onChange={(event) =>
                updateOption("reactorClass", event.target.value as ReactorClass)
              }
            >
              {REACTOR_CLASSES.map((className) => (
                <option key={className} value={className}>
                  {className}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Canister ID</span>
            <input
              value={options.canisterId}
              onChange={(event) =>
                updateOption("canisterId", event.target.value)
              }
              placeholder="optional"
              spellCheck={false}
            />
          </label>
          <label className="switch">
            <input
              type="checkbox"
              checked={options.includeReactor}
              onChange={(event) =>
                updateOption("includeReactor", event.target.checked)
              }
            />
            <span>Inline reactor exports</span>
          </label>
        </div>

        <div className="panes">
          <section className="pane inputPane">
            <div className="paneHeader">
              <h2>contract.did</h2>
              <button type="button" onClick={() => setCandid(DEFAULT_CANDID)}>
                Reset
              </button>
            </div>
            <textarea
              value={candid}
              onChange={(event) => setCandid(event.target.value)}
              spellCheck={false}
              aria-label="Candid source"
            />
          </section>

          <section className="pane outputPane">
            <div className="paneHeader">
              <div className="tabs">
                {(["generated.ts", "index.ts"] as OutputFile[]).map((file) => (
                  <button
                    type="button"
                    key={file}
                    className={activeFile === file ? "active" : ""}
                    onClick={() => setActiveFile(file)}
                  >
                    {file}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={copyActiveFile}
                disabled={!visibleCode}
              >
                {copiedFile === activeFile ? "Copied" : "Copy"}
              </button>
            </div>

            {outputError ? (
              <pre className="errorBox">{outputError}</pre>
            ) : (
              <pre className="codeBlock">{visibleCode}</pre>
            )}
          </section>
        </div>

        <div className="metrics">
          <span>{generated?.methodCount ?? 0} methods</span>
          <span>{generated?.typeCount ?? 0} exported types</span>
          <span>{visibleCode.split("\n").length} visible lines</span>
        </div>
      </section>
    </main>
  )
}

function generatePreview(
  candid: string,
  options: PlaygroundOptions
): GeneratedOutput {
  validateIDL(candid)

  const tsContent = didToTs(candid)
  const jsContent = didToJs(candid)
  const typeBlock = tsContent
    .split("\n")
    .filter((line) => !line.startsWith("export declare const idlFactory"))
    .filter((line) => !line.startsWith("export declare const init"))
    .join("\n")
    .trimEnd()
  const idlFactorySignature =
    extractSignature(tsContent, "idlFactory") ?? ": IDL.InterfaceFactory"
  const idlFactoryImpl = extractJsExport(jsContent, "idlFactory")

  if (!idlFactoryImpl) {
    throw new Error("Could not locate idlFactory in parser output.")
  }

  const idlFactoryTyped = idlFactoryImpl.replace(
    "export const idlFactory",
    `export const idlFactory${idlFactorySignature}`
  )
  const bindings = stripUnusedTypeImports(
    [
      typeBlock,
      "",
      "// -- IDL factory ---------------------------------------------------------",
      idlFactoryTyped,
    ].join("\n")
  )
  const reactorBlock = options.includeReactor
    ? `\n\n${generateReactorBlock(options)}`
    : ""
  const generatedTs = `${generateHeader(options.canisterName)}${bindings}${reactorBlock}\n`
  const indexTs = generateEntryFile()

  return {
    generatedTs,
    indexTs,
    methodCount: countServiceMethods(jsContent),
    typeCount: countExportedTypes(typeBlock),
  }
}

function generateHeader(canisterName: string): string {
  return `/**
 * ${canisterName} generated bindings.
 *
 * AUTO-GENERATED by @ic-reactor/codegen -- do not edit.
 * Regenerated from the source .did on every codegen run.
 */
`
}

function generateEntryFile(): string {
  return `/**
 * Canister entrypoint.
 *
 * Created once by @ic-reactor/codegen and safe to customize.
 * Keep the re-export below if you want generated exports and types to stay in sync.
 */
export * from "./generated"
`
}

function generateReactorBlock(options: PlaygroundOptions): string {
  const pascalName = toPascalCase(options.canisterName)
  const reactorName = `${toCamelCase(options.canisterName)}Reactor`
  const serviceName = `${pascalName}Service`
  const reactorImportSource = getReactorImportSource(
    options.reactorClass,
    options.runtimeTarget
  )
  const reactImport =
    options.runtimeTarget === "react"
      ? 'import { createActorHooks } from "@ic-reactor/react"\n'
      : ""
  const canisterIdLine = options.canisterId.trim()
    ? `  canisterId: ${JSON.stringify(options.canisterId.trim())},\n`
    : ""
  const hooks =
    options.runtimeTarget === "react"
      ? `

export const {
  useActorQuery: use${pascalName}Query,
  useActorSuspenseQuery: use${pascalName}SuspenseQuery,
  useActorInfiniteQuery: use${pascalName}InfiniteQuery,
  useActorSuspenseInfiniteQuery: use${pascalName}SuspenseInfiniteQuery,
  useActorMutation: use${pascalName}Mutation,
  useActorMethod: use${pascalName}Method,
} = createActorHooks(${reactorName})`
      : ""

  return `${reactImport}import { ${options.reactorClass} } from "${reactorImportSource}"
import { clientManager } from "${options.clientManagerPath}"

export type ${serviceName} = _SERVICE

export const ${reactorName} = new ${options.reactorClass}<${serviceName}>({
  clientManager,
  idlFactory,
${canisterIdLine}  name: "${options.canisterName}",
})${hooks}`
}

function getReactorImportSource(
  reactorClass: ReactorClass,
  runtimeTarget: RuntimeTarget
): "@ic-reactor/react" | "@ic-reactor/core" | "@ic-reactor/candid" {
  if (reactorClass === "Reactor" || reactorClass === "DisplayReactor") {
    return runtimeTarget === "core" ? "@ic-reactor/core" : "@ic-reactor/react"
  }
  return "@ic-reactor/candid"
}

function extractSignature(tsContent: string, name: string): string | null {
  const re = new RegExp(
    `export declare const ${escapeRegExp(name)}\\s*:\\s*([^;]+);`
  )
  const match = re.exec(tsContent)
  return match ? `: ${match[1].trim()}` : null
}

function extractJsExport(jsContent: string, name: string): string | null {
  const re = new RegExp(
    `export const ${escapeRegExp(name)}\\s*=\\s*\\([\\s\\S]*?\\)\\s*=>\\s*\\{[\\s\\S]*?\\};`
  )
  return re.exec(jsContent)?.[0].trim() ?? null
}

function stripUnusedTypeImports(content: string): string {
  const lines = content.split("\n")
  return lines
    .map((line, index) => {
      const match = /^import type \{ ([^}]+) \} from (['"][^'"]+['"];?)$/.exec(
        line
      )

      if (!match) return line

      const [, specifierList, importSource] = match
      const otherContent = lines
        .filter((_, lineIndex) => lineIndex !== index)
        .join("\n")
      const usedSpecifiers = specifierList
        .split(",")
        .map((specifier) => specifier.trim())
        .filter((specifier) => {
          const localName = specifier
            .split(/\s+as\s+/)
            .pop()
            ?.trim()
          return localName
            ? new RegExp(`\\b${escapeRegExp(localName)}\\b`).test(otherContent)
            : false
        })

      if (usedSpecifiers.length === 0) return ""

      return `import type { ${usedSpecifiers.join(", ")} } from ${importSource}`
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimStart()
}

function countServiceMethods(jsContent: string): number {
  return (jsContent.match(/IDL\.Func\(/g) ?? []).length
}

function countExportedTypes(typeBlock: string): number {
  return (typeBlock.match(/^export (interface|type) /gm) ?? []).length
}

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")
}

function toCamelCase(value: string): string {
  const pascal = toPascalCase(value)
  return pascal.charAt(0).toLowerCase() + pascal.slice(1)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export default App
