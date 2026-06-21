const { readFileSync, writeFileSync } = require("node:fs")
const { join, resolve } = require("node:path")

const pkgRoot = resolve(__dirname, "..")
const markerStart = "// <ic-reactor-parser-schema-types>"
const markerEnd = "// </ic-reactor-parser-schema-types>"

const TYPES_DECLARATION = `${markerStart}
export interface CandidSchema {
  types: CandidTypeDeclaration[];
  service: CandidServiceDeclaration | null;
}

export type CandidType =
  | { kind: "null" }
  | { kind: "bool" }
  | { kind: "nat" }
  | { kind: "int" }
  | { kind: "nat8" }
  | { kind: "nat16" }
  | { kind: "nat32" }
  | { kind: "nat64" }
  | { kind: "int8" }
  | { kind: "int16" }
  | { kind: "int32" }
  | { kind: "int64" }
  | { kind: "float32" }
  | { kind: "float64" }
  | { kind: "text" }
  | { kind: "reserved" }
  | { kind: "empty" }
  | { kind: "principal" }
  | { kind: "blob" }
  | { kind: "reference"; name: string }
  | { kind: "opt"; type: CandidType }
  | { kind: "vec"; type: CandidType }
  | { kind: "record"; fields: CandidField[] }
  | { kind: "variant"; fields: CandidField[] }
  | { kind: "tuple"; types: CandidType[] }
  | { kind: "func" }
  | { kind: "service" }
  | { kind: "class" }
  | { kind: "unknown" }
  | { kind: "knot" }
  | { kind: "future" };

export interface CandidField {
  name: string;
  type: CandidType;
}

export interface CandidTypeDeclaration {
  name: string;
  type: CandidType;
}

export interface CandidServiceDeclaration {
  methods: CandidMethodDeclaration[];
}

export interface CandidMethodDeclaration {
  name: string;
  mode: "query" | "update" | "oneway";
  args: CandidType[];
  returns: CandidType[];
}
${markerEnd}
`

const targets = [
  join(pkgRoot, "dist", "web", "index.d.ts"),
  join(pkgRoot, "dist", "nodejs", "index.d.ts"),
  join(pkgRoot, "dist", "bundler", "index.d.ts"),
]

function stripExistingDeclaration(content) {
  const start = content.indexOf(markerStart)
  const end = content.indexOf(markerEnd)
  if (start === -1 || end === -1) return content
  return `${content.slice(0, start).trimEnd()}\n${content
    .slice(end + markerEnd.length)
    .trimStart()}`
}

function replaceParseDidReturnType(content) {
  return content.replace(
    /export function parseDid\(prog: string\): [^;]+;/,
    "export function parseDid(prog: string): CandidSchema;"
  )
}

for (const target of targets) {
  try {
    const current = readFileSync(target, "utf-8")
    const withoutExisting = stripExistingDeclaration(current)
    const updated = replaceParseDidReturnType(withoutExisting)
    writeFileSync(
      target,
      `${updated.trimEnd()}\n\n${TYPES_DECLARATION}`,
      "utf-8"
    )
    console.log(`Appended parser schema type definitions to ${target}`)
  } catch (error) {
    console.error(`Failed to append type definitions to ${target}:`, error)
  }
}
