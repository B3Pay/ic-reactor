/**
 * Tests for Zod Codec functionality in candid-visitor.ts
 *
 * This test suite validates the encode/decode functionality for converting
 * between Candid types (backend format) and Display types (frontend format).
 */

import { describe, it, expect } from "vitest"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { didToDisplayCodec } from "../../src/display"

describe("Zod Codecs - Basic Type Transformations", () => {
  it("should convert Principal to string and back", () => {
    const principalType = IDL.Principal
    const codec = didToDisplayCodec<Principal, string>(principalType)

    const candidValue = Principal.fromText("aaaaa-aa")
    const displayValue = codec.asDisplay(candidValue)

    expect(displayValue).toBe("aaaaa-aa")
    expect(typeof displayValue).toBe("string")

    const backToCandid = codec.asCandid(displayValue)
    expect(backToCandid.toText()).toBe("aaaaa-aa")
  })

  it("should convert bigint to string and back", () => {
    const natType = IDL.Nat
    const codec = didToDisplayCodec<bigint, string>(natType)

    const candidValue = 1234567890n
    const displayValue = codec.asDisplay(candidValue)

    expect(displayValue).toBe("1234567890")
    expect(typeof displayValue).toBe("string")

    const backToCandid = codec.asCandid(displayValue)
    expect(backToCandid).toBe(1234567890n)
  })

  it("should handle primitives without transformation", () => {
    const textType = IDL.Text
    const codec = didToDisplayCodec<string, string>(textType)

    const candidValue = "Hello, World!"
    const displayValue = codec.asDisplay(candidValue)

    expect(displayValue).toBe("Hello, World!")

    const backToCandid = codec.asCandid(displayValue)
    expect(backToCandid).toBe("Hello, World!")
  })

  it("should handle boolean values", () => {
    const boolType = IDL.Bool
    const codec = didToDisplayCodec<boolean, boolean>(boolType)

    expect(codec.asDisplay(true)).toBe(true)
    expect(codec.asDisplay(false)).toBe(false)
    expect(codec.asCandid(true)).toBe(true)
    expect(codec.asCandid(false)).toBe(false)
  })

  it("should handle null values", () => {
    const nullType = IDL.Null
    const codec = didToDisplayCodec<null, null>(nullType)

    expect(codec.asDisplay(null)).toBe(null)
    expect(codec.asCandid(null)).toBe(null)
  })
})

describe("Zod Codecs - Optional Types", () => {
  it("should convert optional text from Candid [] to undefined", () => {
    const optType = IDL.Opt(IDL.Text)
    type CandidOpt = [] | [string]
    type DisplayOpt = string | undefined

    const codec = didToDisplayCodec<CandidOpt, DisplayOpt>(optType)

    // Empty array -> undefined
    expect(codec.asDisplay([])).toBeUndefined()

    // Single element array -> value
    expect(codec.asDisplay(["hello"])).toBe("hello")

    // undefined -> empty array
    expect(codec.asCandid(undefined)).toEqual([])

    // value -> single element array
    expect(codec.asCandid("world")).toEqual(["world"])
  })

  it("should convert optional bigint with transformation", () => {
    const optType = IDL.Opt(IDL.Nat)
    type CandidOpt = [] | [bigint]
    type DisplayOpt = string | undefined

    const codec = didToDisplayCodec<CandidOpt, DisplayOpt>(optType)

    expect(codec.asDisplay([])).toBeUndefined()
    expect(codec.asDisplay([999n])).toBe("999")

    expect(codec.asCandid(undefined)).toEqual([])
    expect(codec.asCandid("888")).toEqual([888n])
  })

  it("should convert optional Principal", () => {
    const optType = IDL.Opt(IDL.Principal)
    type CandidOpt = [] | [Principal]
    type DisplayOpt = string | undefined

    const codec = didToDisplayCodec<CandidOpt, DisplayOpt>(optType)

    const principal = Principal.fromText("aaaaa-aa")

    expect(codec.asDisplay([])).toBeUndefined()
    expect(codec.asDisplay([principal])).toBe("aaaaa-aa")

    expect(codec.asCandid(undefined)).toEqual([])
    const result = codec.asCandid("aaaaa-aa")
    expect(result).toHaveLength(1)
    expect(result[0]?.toText()).toBe("aaaaa-aa")
  })
})

describe("Zod Codecs - Array (Vec) Types", () => {
  it("should convert arrays of primitives", () => {
    const vecType = IDL.Vec(IDL.Text)
    const codec = didToDisplayCodec<string[], string[]>(vecType)

    const candidValue = ["hello", "world", "test"]
    const displayValue = codec.asDisplay(candidValue)

    expect(displayValue).toEqual(["hello", "world", "test"])

    const backToCandid = codec.asCandid(displayValue)
    expect(backToCandid).toEqual(["hello", "world", "test"])
  })

  it("should convert arrays of bigints to strings", () => {
    const vecType = IDL.Vec(IDL.Nat)
    const codec = didToDisplayCodec<bigint[], string[]>(vecType)

    const candidValue = [100n, 200n, 300n]
    const displayValue = codec.asDisplay(candidValue)

    expect(displayValue).toEqual(["100", "200", "300"])

    const backToCandid = codec.asCandid(displayValue)
    expect(backToCandid).toEqual([100n, 200n, 300n])
  })

  it("should convert arrays of Principals to strings", () => {
    const vecType = IDL.Vec(IDL.Principal)
    const codec = didToDisplayCodec<Principal[], string[]>(vecType)

    const p1 = Principal.fromText("aaaaa-aa")
    const p2 = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai")
    const candidValue = [p1, p2]

    const displayValue = codec.asDisplay(candidValue)
    expect(displayValue).toEqual(["aaaaa-aa", "rrkah-fqaaa-aaaaa-aaaaq-cai"])

    const backToCandid = codec.asCandid(displayValue)
    expect(backToCandid).toHaveLength(2)
    expect(backToCandid[0]?.toText()).toBe("aaaaa-aa")
    expect(backToCandid[1]?.toText()).toBe("rrkah-fqaaa-aaaaa-aaaaq-cai")
  })
})

describe("Zod Codecs - Variant Types", () => {
  it("should convert null variants to discriminated unions", () => {
    type TodoStatus = { Active: null } | { Completed: null } | { Open: null }

    type TodoStatusDisplay =
      | { _type: "Active" }
      | { _type: "Completed" }
      | { _type: "Open" }

    const statusType = IDL.Variant({
      Active: IDL.Null,
      Completed: IDL.Null,
      Open: IDL.Null,
    })

    const codec = didToDisplayCodec<TodoStatus, TodoStatusDisplay>(statusType)

    // Decode: Candid -> Display
    const activeDisplay = codec.asDisplay({ Active: null })
    expect(activeDisplay).toEqual({ _type: "Active" })

    const completedDisplay = codec.asDisplay({ Completed: null })
    expect(completedDisplay).toEqual({ _type: "Completed" })

    // Encode: Display -> Candid
    const activeCandid = codec.asCandid({ _type: "Active" })
    expect(activeCandid).toEqual({ Active: null })

    const openCandid = codec.asCandid({ _type: "Open" })
    expect(openCandid).toEqual({ Open: null })
  })

  it("should convert variants with values", () => {
    type FeeCalculation = { Fixed: bigint } | { Percentage: number }

    type FeeCalculationDisplay =
      | { _type: "Fixed"; Fixed: string }
      | { _type: "Percentage"; Percentage: number }

    const feeType = IDL.Variant({
      Fixed: IDL.Nat,
      Percentage: IDL.Float64,
    })

    const codec = didToDisplayCodec<FeeCalculation, FeeCalculationDisplay>(
      feeType
    )

    // Decode: Candid -> Display
    const fixedDisplay = codec.asDisplay({ Fixed: 1000n })
    expect(fixedDisplay).toEqual({ _type: "Fixed", Fixed: "1000" })

    const percentDisplay = codec.asDisplay({ Percentage: 5.5 })
    expect(percentDisplay).toEqual({ _type: "Percentage", Percentage: 5.5 })

    // Encode: Display -> Candid
    const fixedCandid = codec.asCandid({ _type: "Fixed", Fixed: "2000" })
    expect(fixedCandid).toEqual({ Fixed: 2000n })

    const percentCandid = codec.asCandid({
      _type: "Percentage",
      Percentage: 7.5,
    })
    expect(percentCandid).toEqual({ Percentage: 7.5 })
  })

  it("should handle complex variants with optional values", () => {
    type ValidationStatus =
      | { Valid: null }
      | { Invalid: { error: string } }
      | { Pending: null }

    type ValidationStatusDisplay =
      | { _type: "Valid" }
      | { _type: "Invalid"; Invalid: { error: string } }
      | { _type: "Pending" }

    const validationType = IDL.Variant({
      Valid: IDL.Null,
      Invalid: IDL.Record({ error: IDL.Text }),
      Pending: IDL.Null,
    })

    const codec = didToDisplayCodec<ValidationStatus, ValidationStatusDisplay>(
      validationType
    )

    // Null variant
    expect(codec.asDisplay({ Valid: null })).toEqual({ _type: "Valid" })

    // Variant with object
    const invalidDisplay = codec.asDisplay({ Invalid: { error: "Bad input" } })
    expect(invalidDisplay).toEqual({
      _type: "Invalid",
      Invalid: { error: "Bad input" },
    })

    // Encode back
    expect(codec.asCandid({ _type: "Valid" })).toEqual({ Valid: null })
    expect(
      codec.asCandid({ _type: "Invalid", Invalid: { error: "Test error" } })
    ).toEqual({
      Invalid: { error: "Test error" },
    })
  })
})

describe("Zod Codecs - Record Types", () => {
  it("should convert simple records", () => {
    type Person = {
      name: string
      age: bigint
    }

    type PersonDisplay = {
      name: string
      age: string
    }

    const personType = IDL.Record({
      name: IDL.Text,
      age: IDL.Nat,
    })

    const codec = didToDisplayCodec<Person, PersonDisplay>(personType)

    const candidPerson: Person = {
      name: "Alice",
      age: 30n,
    }

    const displayPerson = codec.asDisplay(candidPerson)
    expect(displayPerson).toEqual({
      name: "Alice",
      age: "30",
    })

    const backToCandid = codec.asCandid(displayPerson)
    expect(backToCandid).toEqual({
      name: "Alice",
      age: 30n,
    })
  })

  it("should convert records with optional fields", () => {
    type User = {
      name: string
      email: [] | [string]
      age: bigint
    }

    type UserDisplay = {
      name: string
      email: string | undefined
      age: string
    }

    const userType = IDL.Record({
      name: IDL.Text,
      email: IDL.Opt(IDL.Text),
      age: IDL.Nat,
    })

    const codec = didToDisplayCodec<User, UserDisplay>(userType)

    // With email
    const withEmail = codec.asDisplay({
      name: "Bob",
      email: ["bob@example.com"],
      age: 25n,
    })
    expect(withEmail).toEqual({
      name: "Bob",
      email: "bob@example.com",
      age: "25",
    })

    // Without email
    const withoutEmail = codec.asDisplay({
      name: "Charlie",
      email: [],
      age: 35n,
    })
    expect(withoutEmail).toEqual({
      name: "Charlie",
      email: undefined,
      age: "35",
    })

    // Encode back
    const candidWithEmail = codec.asCandid({
      name: "Dave",
      email: "dave@test.com",
      age: "40",
    })
    expect(candidWithEmail).toEqual({
      name: "Dave",
      email: ["dave@test.com"],
      age: 40n,
    })

    const candidWithoutEmail = codec.asCandid({
      name: "Eve",
      email: undefined,
      age: "28",
    })
    expect(candidWithoutEmail).toEqual({
      name: "Eve",
      email: [],
      age: 28n,
    })
  })

  it("should convert nested records", () => {
    type Address = {
      street: string
      city: string
    }

    type Contact = {
      name: string
      address: Address
    }

    const addressType = IDL.Record({
      street: IDL.Text,
      city: IDL.Text,
    })

    const contactType = IDL.Record({
      name: IDL.Text,
      address: addressType,
    })

    const codec = didToDisplayCodec<Contact, Contact>(contactType)

    const contact: Contact = {
      name: "Frank",
      address: {
        street: "123 Main St",
        city: "Springfield",
      },
    }

    const display = codec.asDisplay(contact)
    expect(display).toEqual(contact)

    const backToCandid = codec.asCandid(display)
    expect(backToCandid).toEqual(contact)
  })

  it("should convert records with Principal fields", () => {
    type Order = {
      id: string
      owner: Principal
      amount: bigint
    }

    type OrderDisplay = {
      id: string
      owner: string
      amount: string
    }

    const orderType = IDL.Record({
      id: IDL.Text,
      owner: IDL.Principal,
      amount: IDL.Nat,
    })

    const codec = didToDisplayCodec<Order, OrderDisplay>(orderType)

    const order: Order = {
      id: "order-123",
      owner: Principal.fromText("aaaaa-aa"),
      amount: 5000n,
    }

    const display = codec.asDisplay(order)
    expect(display).toEqual({
      id: "order-123",
      owner: "aaaaa-aa",
      amount: "5000",
    })

    const backToCandid = codec.asCandid(display)
    expect(backToCandid.id).toBe("order-123")
    expect(backToCandid.owner.toText()).toBe("aaaaa-aa")
    expect(backToCandid.amount).toBe(5000n)
  })
})

describe("Zod Codecs - Complex Nested Types", () => {
  it("should handle records with variant fields", () => {
    type Status = { Active: null } | { Completed: null }
    type StatusDisplay = { _type: "Active" } | { _type: "Completed" }

    type Task = {
      title: string
      status: Status
    }

    type TaskDisplay = {
      title: string
      status: StatusDisplay
    }

    const statusType = IDL.Variant({
      Active: IDL.Null,
      Completed: IDL.Null,
    })

    const taskType = IDL.Record({
      title: IDL.Text,
      status: statusType,
    })

    const codec = didToDisplayCodec<Task, TaskDisplay>(taskType)

    const task: Task = {
      title: "Build feature",
      status: { Active: null },
    }

    const display = codec.asDisplay(task)
    expect(display).toEqual({
      title: "Build feature",
      status: { _type: "Active" },
    })

    const backToCandid = codec.asCandid(display)
    expect(backToCandid).toEqual({
      title: "Build feature",
      status: { Active: null },
    })
  })

  it("should handle arrays of records", () => {
    type Item = {
      name: string
      price: bigint
    }

    type ItemDisplay = {
      name: string
      price: string
    }

    const itemType = IDL.Record({
      name: IDL.Text,
      price: IDL.Nat,
    })

    const listType = IDL.Vec(itemType)

    const codec = didToDisplayCodec<Item[], ItemDisplay[]>(listType)

    const items: Item[] = [
      { name: "Apple", price: 100n },
      { name: "Banana", price: 50n },
    ]

    const display = codec.asDisplay(items)
    expect(display).toEqual([
      { name: "Apple", price: "100" },
      { name: "Banana", price: "50" },
    ])

    const backToCandid = codec.asCandid(display)
    expect(backToCandid).toEqual([
      { name: "Apple", price: 100n },
      { name: "Banana", price: 50n },
    ])
  })

  it("should handle optional records", () => {
    type Profile = {
      bio: string
      avatar: bigint
    }

    type ProfileDisplay = {
      bio: string
      avatar: string
    }

    type User = {
      name: string
      profile: [] | [Profile]
    }

    type UserDisplay = {
      name: string
      profile?: ProfileDisplay
    }

    const profileType = IDL.Record({
      bio: IDL.Text,
      avatar: IDL.Nat,
    })

    const userType = IDL.Record({
      name: IDL.Text,
      profile: IDL.Opt(profileType),
    })

    const codec = didToDisplayCodec<User, UserDisplay>(userType)

    // With profile
    const withProfile = codec.asDisplay({
      name: "Alice",
      profile: [{ bio: "Developer", avatar: 123n }],
    })
    expect(withProfile).toEqual({
      name: "Alice",
      profile: { bio: "Developer", avatar: "123" },
    })

    // Without profile
    const withoutProfile = codec.asDisplay({
      name: "Bob",
      profile: [],
    })
    expect(withoutProfile).toEqual({
      name: "Bob",
      profile: undefined,
    })
  })
})

describe("Zod Codecs - Real-World Scenarios", () => {
  it("should handle TaskStatus-like types", () => {
    type TaskStatus =
      | { Todo: null }
      | {
          InProgress: {
            started_at: bigint
          }
        }
      | { Review: null }
      | { Done: null }
      | { Cancelled: null }

    type TaskStatusDisplay =
      | { _type: "Todo" }
      | { _type: "InProgress"; InProgress: { started_at: string } }
      | { _type: "Review" }
      | { _type: "Done" }
      | { _type: "Cancelled" }

    const statusType = IDL.Variant({
      Todo: IDL.Null,
      InProgress: IDL.Record({
        started_at: IDL.Nat64,
      }),
      Review: IDL.Null,
      Done: IDL.Null,
      Cancelled: IDL.Null,
    })

    const codec = didToDisplayCodec<TaskStatus, TaskStatusDisplay>(statusType)

    // Test all variants
    const statuses: TaskStatus[] = [
      { Todo: null },
      { InProgress: { started_at: 1625247600n } },
      { Review: null },
      { Done: null },
      { Cancelled: null },
    ]

    for (const status of statuses) {
      const display = codec.asDisplay(status)
      const key = Object.keys(status)[0]
      expect(display._type).toBe(key)

      const backToCandid = codec.asCandid(display)
      expect(backToCandid).toEqual(status)
    }
  })

  it("should handle complete Project-like records", () => {
    type Project = {
      id: string
      name: string
      lead: Principal
      budget: bigint
      status: { Active: null } | { Completed: null }
      created_at: bigint
      team: Principal[]
      description: [] | [string]
    }

    type ProjectDisplay = {
      id: string
      name: string
      lead: string
      budget: string
      status: { _type: "Active" } | { _type: "Completed" }
      created_at: string
      team: string[]
      description?: string
    }

    const projectType = IDL.Record({
      id: IDL.Text,
      name: IDL.Text,
      lead: IDL.Principal,
      budget: IDL.Nat,
      status: IDL.Variant({ Active: IDL.Null, Completed: IDL.Null }),
      created_at: IDL.Nat64,
      team: IDL.Vec(IDL.Principal),
      description: IDL.Opt(IDL.Text),
    })

    const codec = didToDisplayCodec<Project, ProjectDisplay>(projectType)

    const project: Project = {
      id: "proj-001",
      name: "Website Redesign",
      lead: Principal.fromText("aaaaa-aa"),
      budget: 50000n,
      status: { Active: null },
      created_at: 1625000000n,
      team: [
        Principal.fromText("aaaaa-aa"),
        Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai"),
      ],
      description: ["Redesign corporate website"],
    }

    const display = codec.asDisplay(project)

    expect(display.id).toBe("proj-001")
    expect(display.name).toBe("Website Redesign")
    expect(display.lead).toBe("aaaaa-aa")
    expect(display.budget).toBe("50000")
    expect(display.status).toEqual({ _type: "Active" })
    expect(display.created_at).toBe("1625000000")
    expect(display.team).toEqual(["aaaaa-aa", "rrkah-fqaaa-aaaaa-aaaaq-cai"])
    expect(display.description).toBe("Redesign corporate website")

    const backToCandid = codec.asCandid(display)
    expect(backToCandid.id).toBe("proj-001")
    expect(backToCandid.lead.toText()).toBe("aaaaa-aa")
    expect(backToCandid.budget).toBe(50000n)
    expect(backToCandid.status).toEqual({ Active: null })
  })
})
