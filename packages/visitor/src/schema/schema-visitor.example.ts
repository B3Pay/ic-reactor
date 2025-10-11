/**
 * Examples demonstrating the usage of schema-visitor.ts
 *
 * This file shows how to generate Zod schemas from Candid IDL types
 * for both Candid (backend) and Display (frontend) formats.
 *
 * All examples are fully type-safe using the ToZodSchema and ToDisplay type system.
 */

import { IDL } from "@dfinity/candid"
import {
  idlToZodSchema,
  idlToZodSchemas,
  idlTypesToZodSchemas,
} from "./schema-visitor"
import * as z from "zod"

// ═════════════════════════════════════════════════════════════════════════════
// Example 1: Simple Variant (Status) - Fully Type-Safe
// ═════════════════════════════════════════════════════════════════════════════

type EscrowStatus = { Active: null } | { Completed: null } | { InDispute: null }
type EscrowStatusDisplay =
  | { _type: "Active" }
  | { _type: "Completed" }
  | { _type: "InDispute" }

const StatusIDL = IDL.Variant({
  Active: IDL.Null,
  Completed: IDL.Null,
  InDispute: IDL.Null,
})

// Generate schema for Candid format - FULLY TYPE-SAFE!
// TypeScript knows this schema validates EscrowStatus
const StatusSchemaCandid = idlToZodSchema<EscrowStatus>(StatusIDL, "candid")
type InferredCandidStatus = z.infer<typeof StatusSchemaCandid>
// InferredCandidStatus = { Active: null } | { Completed: null } | { InDispute: null }

// Generate schema for Display format - FULLY TYPE-SAFE!
// TypeScript knows this schema validates EscrowStatusDisplay
const StatusSchemaDisplay = idlToZodSchema<EscrowStatus>(StatusIDL, "display")
type InferredDisplayStatus = z.infer<typeof StatusSchemaDisplay>
// InferredDisplayStatus = { _type: "Active" } | { _type: "Completed" } | { _type: "InDispute" }

// Validate Candid format
const candidResult = StatusSchemaCandid.safeParse({ Active: null })
console.log("Candid validation:", candidResult.success) // true

// Validate Display format
const displayResult = StatusSchemaDisplay.safeParse({ _type: "Active" })
console.log("Display validation:", displayResult.success) // true

// Invalid validation
const invalidResult = StatusSchemaDisplay.safeParse({ Active: null })
console.log("Invalid validation:", invalidResult.success) // false

// ═════════════════════════════════════════════════════════════════════════════
// Example 2: Complex Record (Person)
// ═════════════════════════════════════════════════════════════════════════════

type Person = {
  name: string
  age: bigint
  email: [] | [string]
  balance: bigint
}

type PersonDisplay = {
  name: string
  age: string
  email?: string
  balance: string
}

const PersonIDL = IDL.Record({
  name: IDL.Text,
  age: IDL.Nat,
  email: IDL.Opt(IDL.Text),
  balance: IDL.Nat,
})

// Generate both schemas at once
const { candid: PersonCandid, display: PersonDisplay } =
  idlToZodSchemas(PersonIDL)

// Validate Candid format
const personCandidResult = PersonCandid.safeParse({
  name: "Alice",
  age: 30n,
  email: ["alice@example.com"],
  balance: 1000n,
})
console.log("Person Candid validation:", personCandidResult.success) // true

// Validate Display format
const personDisplayResult = PersonDisplay.safeParse({
  name: "Alice",
  age: "30",
  email: "alice@example.com",
  balance: "1000",
})
console.log("Person Display validation:", personDisplayResult.success) // true

// ═════════════════════════════════════════════════════════════════════════════
// Example 3: Nested Variant with Value (DocumentStatus)
// ═════════════════════════════════════════════════════════════════════════════

type DocumentStatus =
  | { Pending: null }
  | { Approved: { timestamp: bigint } }
  | { Rejected: { reason: string } }

type DocumentStatusDisplay =
  | { _type: "Pending" }
  | { _type: "Approved"; Approved: { timestamp: string } }
  | { _type: "Rejected"; Rejected: { reason: string } }

const DocumentStatusIDL = IDL.Variant({
  Pending: IDL.Null,
  Approved: IDL.Record({ timestamp: IDL.Nat64 }),
  Rejected: IDL.Record({ reason: IDL.Text }),
})

const DocStatusSchemas = idlToZodSchemas(DocumentStatusIDL)

// Validate Candid format with value
const docCandidResult = DocStatusSchemas.candid.safeParse({
  Approved: { timestamp: 1234567890n },
})
console.log("Document Candid validation:", docCandidResult.success) // true

// Validate Display format with value
const docDisplayResult = DocStatusSchemas.display.safeParse({
  _type: "Approved",
  Approved: { timestamp: "1234567890" },
})
console.log("Document Display validation:", docDisplayResult.success) // true

// ═════════════════════════════════════════════════════════════════════════════
// Example 4: Batch Schema Generation
// ═════════════════════════════════════════════════════════════════════════════

const schemas = idlTypesToZodSchemas(
  {
    Status: StatusIDL,
    Person: PersonIDL,
    DocumentStatus: DocumentStatusIDL,
  },
  "display" // Generate display schemas for all
)

// Use the schemas
console.log("Status schema exists:", !!schemas.Status) // true
console.log("Person schema exists:", !!schemas.Person) // true
console.log("DocumentStatus schema exists:", !!schemas.DocumentStatus) // true

// ═════════════════════════════════════════════════════════════════════════════
// Example 5: Array and Optional Types
// ═════════════════════════════════════════════════════════════════════════════

type Config = {
  tags: string[]
  description: [] | [string]
  max_retries: bigint
}

type ConfigDisplay = {
  tags: string[]
  description?: string
  max_retries: string
}

const ConfigIDL = IDL.Record({
  tags: IDL.Vec(IDL.Text),
  description: IDL.Opt(IDL.Text),
  max_retries: IDL.Nat,
})

const ConfigSchemas = idlToZodSchemas(ConfigIDL)

// Validate Candid format
const configCandidResult = ConfigSchemas.candid.safeParse({
  tags: ["urgent", "important"],
  description: ["Some description"],
  max_retries: 5n,
})
console.log("Config Candid validation:", configCandidResult.success) // true

// Validate Display format
const configDisplayResult = ConfigSchemas.display.safeParse({
  tags: ["urgent", "important"],
  description: "Some description",
  max_retries: "5",
})
console.log("Config Display validation:", configDisplayResult.success) // true

// Missing optional field is valid
const configNoOptionalResult = ConfigSchemas.display.safeParse({
  tags: ["urgent"],
  max_retries: "5",
  // description is omitted
})
console.log(
  "Config without optional validation:",
  configNoOptionalResult.success
) // true

// ═════════════════════════════════════════════════════════════════════════════
// Example 6: Type Safety Demonstration
// ═════════════════════════════════════════════════════════════════════════════

// The schemas are fully type-safe and integrate with the ToZodSchema type system
type MyData = {
  id: bigint
  name: string
  active: [] | [boolean]
  status: { Active: null } | { Inactive: { reason: string } }
}

const MyDataIDL = IDL.Record({
  id: IDL.Nat,
  name: IDL.Text,
  active: IDL.Opt(IDL.Bool),
  status: IDL.Variant({
    Active: IDL.Null,
    Inactive: IDL.Record({ reason: IDL.Text }),
  }),
})

// Generate schemas with full type inference
const myDataSchemas = idlToZodSchemas(MyDataIDL)

// TypeScript knows the Candid schema validates MyData
type InferredCandid = z.infer<typeof myDataSchemas.candid>
// InferredCandid matches MyData structure

// TypeScript knows the Display schema validates the transformed type
type InferredDisplay = z.infer<typeof myDataSchemas.display>
// InferredDisplay = {
//   id: string (bigint → string)
//   name: string
//   active?: boolean ([] | [boolean] → boolean | undefined)
//   status: { _type: "Active" } | { _type: "Inactive", Inactive: { reason: string } }
// }

// Use the schemas for validation
const validCandidData = myDataSchemas.candid.safeParse({
  id: 123n,
  name: "Test",
  active: [true],
  status: { Active: null },
})

const validDisplayData = myDataSchemas.display.safeParse({
  id: "123",
  name: "Test",
  active: true,
  status: { _type: "Active" },
})

console.log("Type-safe Candid validation:", validCandidData.success) // true
console.log("Type-safe Display validation:", validDisplayData.success) // true

// Type inference prevents errors at compile time
// The following would cause TypeScript errors:
// const badCandid = myDataSchemas.candid.safeParse({
//   id: "123", // Error: expected bigint, got string
//   name: "Test",
//   active: true, // Error: expected [] | [boolean], got boolean
//   status: { _type: "Active" } // Error: expected { Active: null }, got Display format
// })

// const badDisplay = myDataSchemas.display.safeParse({
//   id: 123n, // Error: expected string, got bigint
//   name: "Test",
//   active: [true], // Error: expected boolean | undefined, got Candid format
//   status: { Active: null } // Error: expected Display format with _type
// })
