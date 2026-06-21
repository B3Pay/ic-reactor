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

export interface CandidMetadata {
  description?: string;
  docs?: string[];
  validation?: CandidValidationMetadata;
}

export interface CandidValidationMetadata {
  minimum?: CandidValidationBound;
  maximum?: CandidValidationBound;
  minLength?: CandidValidationBound;
  maxLength?: CandidValidationBound;
  pattern?: string;
  format?: CandidValidationFormat;
}

export interface CandidValidationBound {
  value: string;
  message?: string;
}

export interface CandidValidationFormat {
  type: string;
  message?: string;
  regex?: string;
  jsonSchemaFormat?: string;
  contentEncoding?: string;
  errorMessage?: string;
}

export type CandidType =
  | ({ kind: "null" } & CandidMetadataCarrier)
  | ({ kind: "bool" } & CandidMetadataCarrier)
  | ({ kind: "nat" } & CandidMetadataCarrier)
  | ({ kind: "int" } & CandidMetadataCarrier)
  | ({ kind: "nat8" } & CandidMetadataCarrier)
  | ({ kind: "nat16" } & CandidMetadataCarrier)
  | ({ kind: "nat32" } & CandidMetadataCarrier)
  | ({ kind: "nat64" } & CandidMetadataCarrier)
  | ({ kind: "int8" } & CandidMetadataCarrier)
  | ({ kind: "int16" } & CandidMetadataCarrier)
  | ({ kind: "int32" } & CandidMetadataCarrier)
  | ({ kind: "int64" } & CandidMetadataCarrier)
  | ({ kind: "float32" } & CandidMetadataCarrier)
  | ({ kind: "float64" } & CandidMetadataCarrier)
  | ({ kind: "text" } & CandidMetadataCarrier)
  | ({ kind: "reserved" } & CandidMetadataCarrier)
  | ({ kind: "empty" } & CandidMetadataCarrier)
  | ({ kind: "principal" } & CandidMetadataCarrier)
  | ({ kind: "blob" } & CandidMetadataCarrier)
  | ({ kind: "reference"; name: string } & CandidMetadataCarrier)
  | ({ kind: "opt"; type: CandidType } & CandidMetadataCarrier)
  | ({ kind: "vec"; type: CandidType } & CandidMetadataCarrier)
  | ({ kind: "record"; fields: CandidField[] } & CandidMetadataCarrier)
  | ({ kind: "variant"; fields: CandidField[] } & CandidMetadataCarrier)
  | ({ kind: "tuple"; types: CandidType[] } & CandidMetadataCarrier)
  | ({ kind: "func" } & CandidMetadataCarrier)
  | ({ kind: "service" } & CandidMetadataCarrier)
  | ({ kind: "class" } & CandidMetadataCarrier)
  | ({ kind: "unknown" } & CandidMetadataCarrier)
  | ({ kind: "knot" } & CandidMetadataCarrier)
  | ({ kind: "future" } & CandidMetadataCarrier);

export interface CandidMetadataCarrier {
  metadata?: CandidMetadata;
}

export interface CandidField {
  name: string;
  type: CandidType;
  metadata?: CandidMetadata;
}

export interface CandidTypeDeclaration {
  name: string;
  type: CandidType;
  metadata?: CandidMetadata;
}

export interface CandidServiceDeclaration {
  methods: CandidMethodDeclaration[];
  metadata?: CandidMetadata;
}

export interface CandidMethodDeclaration {
  name: string;
  mode: "query" | "update" | "oneway";
  args: CandidType[];
  returns: CandidType[];
  metadata?: CandidMetadata;
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
