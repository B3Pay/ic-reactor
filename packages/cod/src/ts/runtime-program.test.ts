import { before, describe, it } from "node:test"
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { CandidValidationError, c, type FormField } from "./index.js"
import {
  initWasmForTest,
  programForTest,
  assertBytesEqual,
} from "./test-helpers.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const fixtureDir = resolve(
  __dirname,
  "..",
  "..",
  "tests",
  "fixtures",
  "runtime"
)

before(() => {
  initWasmForTest()
})

describe("compileDid runtime program", () => {
  it("compiles DID to RuntimeProgram and exposes methods and types", async () => {
    const program = await c.compileDid(fixture("basic.did"))

    assert.deepEqual(
      program.listMethods().map((method) => method.name),
      ["icrc1_balance_of"]
    )
    assert.equal(program.listMethods()[0]?.mode, "query")
    assert.deepEqual(
      program.listTypes().map((type) => type.name),
      ["Account"]
    )
    assert.equal(program.method("icrc1_balance_of").name, "icrc1_balance_of")
    assert.equal(program.type("Account").metadata().name, "Account")
  })

  it("rejects imports clearly", async () => {
    await assert.rejects(
      () => c.compileDid(`import "other.did"; service : {}`),
      /imports are not supported/i
    )
  })

  it("generates cod TypeScript from DID source", () => {
    const generated = c.generateTypescript(`
type Contact = record { email : text };
service : { save : (Contact) -> () };
`)

    assert.match(generated, /export const Contact = c\.record/)
    assert.match(generated, /export type Contact = c\.Infer<typeof Contact>/)
    assert.match(generated, /export const canister = c\.service/)
    assert.doesNotMatch(generated, /export function createCandidProgram/)
  })

  it("uses a configured canister name when generating TypeScript", () => {
    const generated = c.generateTypescript(
      `service : { greet : (text) -> (text) query }`,
      { canisterName: "hello-world" }
    )

    assert.match(generated, /export const hello_world = c\.service/)
    assert.doesNotMatch(generated, /export const canister = c\.service/)
  })
})

describe("IR to schema", () => {
  it("builds record, option, named-ref, and bigint schemas", async () => {
    const program = await c.compileDid(fixture("basic.did"))
    const account = program.type("Account")

    assert.equal(
      account.toCandid({
        owner: "2vxsx-fae",
        subaccount: null,
      }),
      `record { owner = principal "2vxsx-fae"; subaccount = null }`
    )
  })

  it("builds variant schemas", async () => {
    const program = await c.compileDid(fixture("variants.did"))
    const result = program.type("Result")

    assert.equal(result.toCandid({ ok: 10n }), "variant { ok = 10 : nat }")
    assert.deepEqual(result.fromCandid('variant { err = "nope" }'), {
      err: "nope",
    })
  })

  it("uses lazy schemas for recursive refs without crashing", async () => {
    const program = await c.compileDid(fixture("recursive.did"))
    const list = program.type("List")

    assert.equal(list.toCandid(null), "null")
    assert.equal(
      list.toCandid({ head: 1n, tail: null }),
      "opt (record { head = 1 : nat; tail = null })"
    )
  })
})

describe("dynamic method bytes", () => {
  it("encodes args through live schemas and matches the existing byte path", async () => {
    const did = fixture("basic.did")
    const program = await c.compileDid(did)
    const raw = programForTest(did)
    const method = program.method("icrc1_balance_of")

    const dynamicBytes = method.encodeArgs([
      {
        owner: "2vxsx-fae",
        subaccount: null,
      },
    ])
    const rawBytes = raw.encodeMethodArgs(
      "icrc1_balance_of",
      `(record { owner = principal "2vxsx-fae"; subaccount = null })`
    )

    assertBytesEqual(dynamicBytes, rawBytes)
    assert.deepEqual(method.decodeArgs(dynamicBytes), [
      {
        owner: "2vxsx-fae",
        subaccount: undefined,
      },
    ])
  })

  it("accepts undefined for DID optional fields", async () => {
    const program = await c.compileDid(fixture("basic.did"))
    const method = program.method("icrc1_balance_of")

    const bytes = method.encodeArgs([
      {
        owner: "2vxsx-fae",
        subaccount: undefined,
      },
    ])

    assert.deepEqual(method.decodeArgs(bytes), [
      {
        owner: "2vxsx-fae",
        subaccount: undefined,
      },
    ])
  })

  it("encodes and decodes replies", async () => {
    const program = await c.compileDid(fixture("basic.did"))
    const method = program.method("icrc1_balance_of")

    const reply = method.encodeReply(123n)
    assert.equal(method.decodeReply(reply), 123n)
  })
})

describe("dynamic actor", () => {
  it("sends bytes to fake query transport and returns decoded values", async () => {
    const program = await c.compileDid(fixture("basic.did"))
    const method = program.method("icrc1_balance_of")
    const expectedArg = method.encodeArgs([
      {
        owner: "2vxsx-fae",
        subaccount: null,
      },
    ])
    const reply = method.encodeReply(777n)
    const seen: Array<{
      canisterId: unknown
      methodName: string
      arg: Uint8Array
    }> = []

    const actor = program.createActor({
      canisterId: "aaaaa-aa",
      agent: {
        async query(canisterId, options) {
          seen.push({
            canisterId,
            methodName: options.methodName,
            arg: options.arg,
          })
          return { status: "replied", reply: { arg: reply } }
        },
      },
    })

    const value = await actor.call("icrc1_balance_of", [
      {
        owner: "2vxsx-fae",
        subaccount: null,
      },
    ])

    assert.equal(value, 777n)
    assert.equal(seen[0]?.canisterId, "aaaaa-aa")
    assert.equal(seen[0]?.methodName, "icrc1_balance_of")
    assertBytesEqual(seen[0]!.arg, expectedArg)
  })

  it("validates args before transport calls", async () => {
    const program = await c.compileDid(fixture("basic.did"))
    let queryCalls = 0

    const actor = program.createActor({
      canisterId: "aaaaa-aa",
      agent: {
        async query() {
          queryCalls += 1
          throw new Error("transport should not be called")
        },
      },
    })

    await assert.rejects(
      () => actor.call("icrc1_balance_of", [{ subaccount: undefined }]),
      (error) => {
        assert.ok(error instanceof CandidValidationError)
        assert.equal(error.path, "args[0].owner")
        assert.match(error.message, /expected principal/)
        return true
      }
    )
    assert.equal(queryCalls, 0)
  })

  it("enforces query and update modes before transport calls", async () => {
    const program = await c.compileDid(fixture("icrc-ledger.did"))
    let transportCalls = 0
    const actor = program.createActor({
      canisterId: "aaaaa-aa",
      agent: {
        async query() {
          transportCalls += 1
          return new Uint8Array()
        },
        async update() {
          transportCalls += 1
          return new Uint8Array()
        },
      },
    })

    assert.throws(
      () => actor.query("icrc1_transfer", [transferArg()]),
      /method "icrc1_transfer" is not a query/
    )
    assert.throws(
      () =>
        actor.update("icrc1_balance_of", [
          { owner: "2vxsx-fae", subaccount: undefined },
        ]),
      /method "icrc1_balance_of" is not an update/
    )
    assert.equal(transportCalls, 0)
  })

  it("uses agent.update with effective canister id and polling options", async () => {
    const program = await c.compileDid(fixture("icrc-ledger.did"))
    const method = program.method("icrc1_transfer")
    const reply = method.encodeReply({ Ok: 1000n })
    const pollingOptions = { test: "polling" }
    const nonce = new Uint8Array([1, 2, 3])
    const seen: Array<{
      canisterId: unknown
      methodName: string
      effectiveCanisterId: unknown
      nonce?: Uint8Array
      pollingOptions: unknown
    }> = []

    const actor = program.createActor({
      canisterId: "aaaaa-aa",
      effectiveCanisterId: "effective-aa",
      pollingOptions,
      nonce,
      agent: {
        async update(canisterId, options, receivedPollingOptions) {
          const seenCall: {
            canisterId: unknown
            methodName: string
            effectiveCanisterId: unknown
            nonce?: Uint8Array
            pollingOptions: unknown
          } = {
            canisterId,
            methodName: options.methodName,
            effectiveCanisterId: options.effectiveCanisterId,
            pollingOptions: receivedPollingOptions,
          }
          if (options.nonce !== undefined) {
            seenCall.nonce = options.nonce
          }
          seen.push(seenCall)
          return { reply }
        },
      },
    })

    const result = await actor.update("icrc1_transfer", [transferArg()])

    assert.deepEqual(result, { Ok: 1000n })
    assert.equal(seen[0]?.canisterId, "aaaaa-aa")
    assert.equal(seen[0]?.methodName, "icrc1_transfer")
    assert.equal(seen[0]?.effectiveCanisterId, "effective-aa")
    assert.equal(seen[0]?.nonce, nonce)
    assert.equal(seen[0]?.pollingOptions, pollingOptions)
  })

  it("rejects raw update submissions that do not contain reply bytes", async () => {
    const program = await c.compileDid(fixture("icrc-ledger.did"))
    const actor = program.createActor({
      canisterId: "aaaaa-aa",
      agent: {
        async call() {
          return { requestId: new Uint8Array([1, 2, 3]) }
        },
      },
    })

    await assert.rejects(
      () => actor.update("icrc1_transfer", [transferArg()]),
      /returned a request id but no reply bytes/
    )
  })

  it("creates a DID-backed actor through c.actor", async () => {
    const program = await c.compileDid(fixture("basic.did"))
    const reply = program.method("icrc1_balance_of").encodeReply(42n)

    const actor = await c.actor({
      candidSource: fixture("basic.did"),
      canisterId: "aaaaa-aa",
      agent: {
        async query() {
          return { status: "replied", reply: { arg: reply } }
        },
      },
    })

    const result = await actor.query("icrc1_balance_of", [
      {
        owner: "2vxsx-fae",
        subaccount: undefined,
      },
    ])

    assert.equal(result, 42n)
  })
})

describe("form schema", () => {
  it("includes args, returns, record children, and optional fields", async () => {
    const program = await c.compileDid(fixture("basic.did"))
    const form = program.method("icrc1_balance_of").toFormSchema()

    assert.equal(form.args[0]?.kind, "record")
    assert.equal(form.args[0]?.children?.[0]?.name, "owner")
    assert.equal(form.args[0]?.children?.[0]?.kind, "principal")
    assert.equal(form.args[0]?.children?.[1]?.name, "subaccount")
    assert.equal(form.args[0]?.children?.[1]?.kind, "option")
    assert.equal(form.args[0]?.children?.[1]?.required, false)
    assert.equal(form.returns[0]?.kind, "bigint")
  })

  it("includes variant options", async () => {
    const program = await c.compileDid(fixture("variants.did"))
    const form = program.method("get").toFormSchema()

    assert.equal(form.returns[0]?.kind, "variant")
    assert.deepEqual(
      form.returns[0]?.options?.map((option) => option.name),
      ["ok", "err", "none"]
    )
  })

  it("preserves docs from comments", async () => {
    const program = await c.compileDid(fixture("comments.did"))
    const form = program.method("icrc1_balance_of").toFormSchema()

    assert.deepEqual(form.docs, ["Returns the account balance."])
    assert.deepEqual(form.args[0]?.docs, ["Account docs."])
    assert.deepEqual(form.args[0]?.children?.[0]?.docs, ["Owner docs."])
  })

  it("preserves doc tags and normalizes validation metadata", async () => {
    const program = await c.compileDid(validatorDid(), {
      customJSDocFormatTypes: {
        "phone-number": {
          regex: "^\\d{3}-\\d{3}-\\d{4}$",
          errorMessage: "Use 555-123-4567 format.",
        },
      },
    })
    const contact = program.ir.types.find((type) => type.name === "Contact")

    assert.deepEqual(contact?.docs, ["Contact docs."])
    assert.deepEqual(contact?.rawDocs, ["Contact docs.", "@strict"])
    assert.deepEqual(contact?.docTags, [{ name: "strict", value: "" }])
    assert.equal(contact?.type.kind, "record")
    if (contact?.type.kind !== "record") {
      throw new Error("expected Contact record")
    }

    const emailIr = contact.type.fields.find((field) => field.name === "email")
    const phoneIr = contact.type.fields.find((field) => field.name === "phone")
    assert.deepEqual(emailIr?.docs, undefined)
    assert.deepEqual(emailIr?.rawDocs, ["@format email Invalid email"])
    assert.deepEqual(emailIr?.docTags, [
      { name: "format", value: "email Invalid email" },
    ])
    assert.deepEqual(phoneIr?.docTags, [
      { name: "format", value: "phone-number" },
    ])

    const form = program.method("save").toFormSchema()
    const contactField = form.args[0]!
    const email = child(contactField, "email")
    const phone = child(contactField, "phone")
    const name = child(contactField, "name")
    const code = child(contactField, "code")
    const age = child(contactField, "age")
    const aliases = child(contactField, "aliases")

    assert.deepEqual(email.docs, undefined)
    assert.deepEqual(email.rawDocs, ["@format email Invalid email"])
    assert.deepEqual(email.validation, [
      { kind: "format", value: "email", message: "Invalid email" },
    ])
    assert.equal(name.name, "name")
    assert.equal(name.label, "Full name")
    assert.equal(name.path, "args[0].name")
    assert.deepEqual(phone.validation, [
      {
        kind: "format",
        value: "phone-number",
        regex: "^\\d{3}-\\d{3}-\\d{4}$",
        errorMessage: "Use 555-123-4567 format.",
      },
    ])
    assert.deepEqual(name.validation, [
      { kind: "minLength", value: 2, rawValue: "2", message: "Too short" },
      { kind: "maxLength", value: 5, rawValue: "5", message: "Too long" },
    ])
    assert.deepEqual(code.validation, [
      { kind: "pattern", value: "^[A-Z]{2}\\d{2}$" },
    ])
    assert.deepEqual(age.validation, [
      { kind: "minimum", value: 18, rawValue: "18", message: "Too young" },
      { kind: "maximum", value: 65, rawValue: "65", message: "Too old" },
    ])
    assert.deepEqual(aliases.children?.[0]?.validation, [
      {
        kind: "minLength",
        value: 2,
        rawValue: "2",
        message: "Alias too short",
      },
    ])
  })

  it("validates generated form state with doc-comment rules", async () => {
    const program = await c.compileDid(validatorDid(), {
      customJSDocFormatTypes: {
        "phone-number": {
          regex: "^\\d{3}-\\d{3}-\\d{4}$",
          errorMessage: "Use 555-123-4567 format.",
        },
      },
    })
    const form = program.method("save").toFormSchema()
    const state = c.createFormState(form.args)
    const contact = state[0]!
    const fields = contact.children!

    fields["email"]!.value = "not-an-email"
    fields["phone"]!.value = "555-123"
    fields["name"]!.value = "A"
    fields["code"]!.value = "bad"
    fields["age"]!.value = "17"
    fields["aliases"]!.items = [{ value: "x" }]

    let issues = c.validateFormState(state, form.args)
    assertIssue(issues, "Invalid email")
    assertIssue(issues, "Use 555-123-4567 format.")
    assertIssue(issues, "Too short")
    assertIssue(issues, "must match pattern /^[A-Z]{2}\\d{2}$/")
    assertIssue(issues, "Too young")
    assertIssue(issues, "Alias too short")
    assertNoIssue(issues, "Optional email invalid")

    fields["optional_email"]!.enabled = true
    fields["optional_email"]!.inner = { value: "bad" }
    issues = c.validateFormState(state, form.args)
    assertIssue(issues, "Optional email invalid")

    fields["email"]!.value = "dev@example.com"
    fields["phone"]!.value = "555-123-4567"
    fields["name"]!.value = "abcdef"
    fields["code"]!.value = "AB12"
    fields["age"]!.value = "66"
    fields["aliases"]!.items = [{ value: "ok" }]
    fields["optional_email"]!.enabled = false

    issues = c.validateFormState(state, form.args)
    assertIssue(issues, "Too long")
    assertIssue(issues, "Too old")
    assertNoIssue(issues, "Invalid email")
    assertNoIssue(issues, "Use 555-123-4567 format.")
  })
})

describe("workflow schema", () => {
  it("maps each method to one workflow node and preserves mode and fields", async () => {
    const program = await c.compileDid(fixture("icrc-ledger.did"))
    const workflow = program.toWorkflowSchema()

    assert.deepEqual(
      workflow.nodes.map((node) => node.methodName),
      ["icrc1_balance_of", "icrc1_transfer"]
    )
    assert.equal(workflow.nodes[0]?.type, "canister_method")
    assert.equal(workflow.nodes[0]?.mode, "query")
    assert.equal(workflow.nodes[1]?.mode, "update")
    assert.equal(workflow.nodes[1]?.inputs[0]?.kind, "record")
    assert.equal(workflow.nodes[1]?.outputs[0]?.kind, "variant")
  })
})

function fixture(name: string): string {
  return readFileSync(resolve(fixtureDir, name), "utf8")
}

function transferArg() {
  return {
    to: {
      owner: "2vxsx-fae",
      subaccount: undefined,
    },
    fee: undefined,
    memo: undefined,
    from_subaccount: undefined,
    created_at_time: undefined,
    amount: 1000n,
  }
}

function validatorDid(): string {
  return `
// Contact docs.
// @strict
type Contact = record {
  // @label Full name
  // @minLength 2 Too short
  // @maxLength 5 Too long
  name : text;

  // @format email Invalid email
  email : text;

  /// @format phone-number
  phone : text;

  // @pattern ^[A-Z]{2}\\d{2}$
  code : text;

  // @minimum 18 Too young
  // @maximum 65 Too old
  age : nat8;

  // @elementMinLength 2 Alias too short
  aliases : vec text;

  // @format email Optional email invalid
  optional_email : opt text;
};

service : {
  save : (Contact) -> ();
}
`
}

function child(field: FormField, name: string): FormField {
  const childField = field.children?.find(
    (candidate) => candidate.name === name
  )
  if (!childField) {
    throw new Error(`missing child field ${name}`)
  }
  return childField
}

function assertIssue(
  issues: readonly c.FormStateIssue[],
  message: string
): void {
  assert.ok(
    issues.some((issue) => issue.message.includes(message)),
    `expected issue containing ${JSON.stringify(message)}, got ${JSON.stringify(issues)}`
  )
}

function assertNoIssue(
  issues: readonly c.FormStateIssue[],
  message: string
): void {
  assert.ok(
    !issues.some((issue) => issue.message.includes(message)),
    `did not expect issue containing ${JSON.stringify(message)}, got ${JSON.stringify(issues)}`
  )
}
