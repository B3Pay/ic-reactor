import { appendFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const pkgRoot = resolve(__dirname, "..")

const TYPES_DECLARATION = `
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
`

const targets = [
  join(pkgRoot, "dist", "web", "index.d.ts"),
  join(pkgRoot, "dist", "nodejs", "index.d.ts"),
  join(pkgRoot, "dist", "bundler", "index.d.ts"),
]

for (const target of targets) {
  try {
    appendFileSync(target, TYPES_DECLARATION, "utf-8")
    console.log(`✅ Appended type definitions to ${target}`)
  } catch (error) {
    console.error(`❌ Failed to append type definitions to ${target}:`, error)
  }
}
