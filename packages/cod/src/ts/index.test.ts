import { c, CandidProgram, type AgentCallRequest } from "./index.js"

const did = `
type Contact = record {
  email : text;
  age : nat8;
};

service : {
  save : (Contact) -> (variant { ok : nat; err : text });
  lookup : (principal) -> (opt Contact) query;
}
`

async function example() {
  await c.init()
  const program = c.program(did)
  const arg = program.encodeMethodArgs(
    "save",
    `(record { email = "dev@example.com"; age = 42 })`
  )
  const request: AgentCallRequest = {
    canisterId: "aaaaa-aa",
    methodName: "save",
    arg,
  }

  const summary = program.summary()
  const serviceDid = program.serviceDid()
  const dynamic = c.encodeArgs(`(42, "ic")`)
  const decoded = c.decodeArgs(dynamic)

  void request
  void summary
  void serviceDid
  void decoded
}

const ProgramCtor: typeof CandidProgram = CandidProgram

void example
void ProgramCtor
