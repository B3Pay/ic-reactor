## ProgramIR architecture cleanup queue

### **IR-01 — Make `MethodId` a real arena identity**

**Priority: Critical**

**Status: [x] Done**

Current problem:

```rust
TypeKindIr::Service {
    methods: Vec<MethodIr>,
}

MethodIr {
    id: MethodId,
    ...
}
```

`MethodId` exists, but methods are still embedded inside service nodes. There is no real method arena or `graph.method(MethodId)` lookup. Workflows still use method names as identity.

Target:

```rust
pub struct ProgramIr {
    pub version: u16,
    pub types: Vec<TypeNodeIr>,
    pub declarations: Vec<TypeDeclIr>,
    pub methods: Vec<MethodIr>,
    pub actor: Option<ActorIr>,
}

pub enum TypeKindIr {
    Service {
        methods: Vec<MethodId>,
    },
}
```

`MethodId(n)` means:

```rust
program.methods[n]
```

Add:

```rust
graph.method(MethodId)
graph.service_method_ids(TypeId)
graph.service_methods(TypeId)
```

**We should fix this first because the whole future architecture is method-first.**

---

### **IR-02 — Remove redundant `DeclId` from `TypeDeclIr`**

**Priority: High**

**Status: [x] Done**

Current:

```rust
pub struct TypeDeclIr {
    pub id: DeclId,
    pub name: String,
    pub typ: TypeId,
    ...
}
```

But validation already requires:

```text
declaration.id == declarations[index]
```

So identity is stored twice.

Target:

```rust
pub struct TypeDeclIr {
    pub name: String,
    pub typ: TypeId,
    pub metadata: MetadataIr,
}
```

Then:

```rust
program.declarations[3]
```

is `DeclId(3)`.

No duplicated identity. No `NonSequentialDeclarationId`. No `DuplicateDeclarationId`.

---

### **IR-03 — Strengthen ProgramIR invariants**

**Priority: Critical**

**Status: [x] Done**

Three validations are currently missing.

#### A. Reject oneway returns

Invalid:

```rust
MethodIr {
    mode: MethodModeIr::Oneway,
    returns: vec![...],
}
```

The TS schema layer currently catches this too late.

ProgramIR itself should reject it.

The same invariant applies to:

```rust
TypeKindIr::Func
```

with `mode == Oneway`.

#### B. Reject direct structural TypeId cycles

Invalid graph:

```text
TypeId(0)
   ↓
Opt
   ↓
TypeId(0)
```

Recursion must pass through:

```text
Type → Decl → Type
```

because declaration references are the explicit recursion boundary.

Add DFS validation over direct `TypeRefIr::Type` edges.

#### C. Make named field identity consistent

Current:

```rust
Named {
    name: String,
    candid_id: u32,
}
```

allows:

```rust
Named {
    name: "owner",
    candid_id: 42,
}
```

The two values may disagree.

My preference remains:

```rust
pub enum FieldLabelIr {
    Named {
        name: String,
    },
    Id {
        candid_id: u32,
    },
    Unnamed {
        candid_id: u32,
    },
}
```

For named fields:

```rust
label.candid_id()
```

derives the Candid hash from `name`.

**One source of truth.**

---

### **IR-04 — Define ID scope explicitly**

**Priority: High, mostly architectural/documentation**

**Status: [x] Done**

`TypeId`, `DeclId`, and `MethodId` are currently allocated during compilation.

Therefore:

```text
MethodId(7)
```

means:

> Method 7 inside this exact ProgramIR artifact.

It does **not** mean:

> A globally stable method identity forever.

Target rule:

> `TypeId`, `DeclId`, and `MethodId` are ProgramIR-artifact-local identities. They are only meaningful together with the exact ProgramIR artifact from which they originate.

We do not need a ProgramHash yet.

But `ARCHITECTURE.md` must stop describing these simply as “stable IDs.” The current workflow section uses that wording.

Later:

```text
ProgramFingerprint + MethodId
```

can become a persistent method reference.

---

### **IR-05 — Delete Rust `EmitterProgram` compatibility IR**

**Priority: Critical**

**Status: [x] Done**

Before this cleanup, the generator recreated an old recursive Candid model:

```rust
EmitterProgram
CandidActorIr
CandidTypeDeclIr
CandidServiceIr
CandidMethodIr
CandidArgIr
CandidTypeIr
CandidFieldIr
EmitterProgramBuilder
```

It converted `ProgramIrGraph` into that recursive model.

Delete all of it.

Target emitter:

```rust
TypeScriptEmitter
    ↓
ProgramIrGraph
    ↓
TypeId / DeclId / MethodId
```

Functions should look conceptually like:

```rust
emit_type_id(graph, TypeId)
emit_type_ref(graph, TypeRefIr)
emit_method(graph, MethodId)
emit_service(graph, TypeId)
```

The emitter directly visits ProgramIR.

---

### **IR-06 — Delete TypeScript `RuntimeProgramIR` compatibility IR**

**Priority: Critical**

**Status: [x] Done**

Before this cleanup, TS had both:

```ts
ProgramIR
```

and:

```ts
RuntimeProgramIR
CandidTypeIR
CandidMethodIR
CandidArgIR
CandidFieldIR
```

`ProgramIrGraph.runtimeProgram()` reconstructed the recursive tree.

Then `RuntimeProgramImpl` immediately switched to it:

```ts
this.#runtimeIr = runtimeProgramView(options.ir)
```

This compatibility model was deleted.

Target:

```ts
irToSchema(ir: ProgramIR)
programToFormSchema(ir: ProgramIR)
programToWorkflowSchema(ir: ProgramIR)
validateMethodArgs(method: ProgramMethodIR, graph: ProgramIrGraph)
```

All consumers traverse the arena directly.

---

### **IR-07 — Add a shared semantic analysis layer**

**Priority: Critical after IR-05/06**

**Status: [x] Done**

Current semantic divergence already exists.

TS runtime currently interprets:

```text
vec nat8 → blob
```

through shared runtime graph/schema helpers.

Rust generator keeps:

```text
vec nat8 → c.vec(c.nat8())
```

and explicitly tests that behavior.

Rust generator also detects tuple records itself.

Dynamic TS schema treats records as records.

Target:

```text
ProgramIR wire graph
        ↓
semantic analysis
        ↓
ProgramSemantics
```

Possible model:

```rust
pub struct ProgramSemantics {
    pub types: Vec<TypeSemantics>,
}

pub struct TypeSemantics {
    pub semantic: Option<TypeSemanticIr>,
}

pub enum TypeSemanticIr {
    Blob,
    Tuple,
    Result {
        ok_field: u32,
        err_field: u32,
    },
}
```

Important:

> Do not put `Blob` or `Tuple` back into `TypeKindIr`.

The wire graph remains true Candid structure.

---

### **IR-08 — Add semantic parity tests**

**Priority: High**

**Status: [x] Done**

The current parity test claims it covers `vec nat8`, but its fixture actually declares both relevant fields as `blob`.

Add explicit fixtures:

```did
type ExplicitVec = vec nat8;
```

and:

```did
type Pair = record {
    text;
    nat64;
};
```

Also:

```did
type Result = variant {
    Ok : nat;
    Err : text;
};
```

Tests should assert not only byte equality.

They should compare semantic projection:

```text
Rust emitter semantic choice
==
dynamic schema semantic choice
==
form semantic choice
```

---

### **IR-09 — Compile and lower once inside `CandidProgram`**

**Priority: High**

**Status: [ ] Pending**

Current:

```rust
pub struct CandidProgram {
    env: TypeEnv,
    actor: Option<Type>,
    prog: IDLMergedProg,
}
```

Every:

```rust
program.ir()
```

lowers again.

Target:

```rust
pub struct CandidProgram {
    ir: ProgramIr,
    codec: CandidCodec,
}
```

Conceptually:

```rust
pub struct CandidCodec {
    env: TypeEnv,
    actor: Option<Type>,
}
```

Then:

```rust
pub fn ir(&self) -> &ProgramIr
```

Our law becomes real:

> Parse once. Lower once. ProgramIR becomes truth.

---

### **IR-10 — Make `summary()` consume ProgramIR**

**Priority: Medium/High**

**Status: [ ] Pending**

Current `summary()` calls:

```rust
env.as_service(...)
env.as_func(...)
```

and independently discovers the service structure.

That's another structural consumer.

Target:

```rust
ProgramSummary::from_graph(&program.graph()?)
```

The codec's `TypeEnv` remains valid for:

```text
encode
decode
typed annotation
```

but not for program inspection.

---

### **IR-11 — Add `encode_method_reply` and remove fake DID reparsing**

**Priority: High**

**Status: [ ] Pending**

Current runtime reply encoding builds a fake DID:

```ts
new CandidProgram(`
  service : {
    __reply : (${this.#schema.returnsDid()}) -> ();
  }
`)
```

Then it reparses the fake program to encode the reply. `encodeReply()` uses that path.

Target Rust:

```rust
pub fn encode_method_reply(
    &self,
    method: &str,
    reply_text: &str,
) -> Result<Vec<u8>>
```

using:

```rust
func.rets
```

Expose it through WASM.

Then:

```ts
encodeReply(value: unknown): Uint8Array {
  return this.#program.encodeMethodReply(
    this.name,
    this.#schema.replyToCandid(value)
  )
}
```

Delete:

```ts
#replyProgram
replyProgram()
```

---

### **IR-12 — Make the Rust ↔ TS ProgramIR contract exact**

**Priority: High**

**Status: [ ] Pending**

Current Rust metadata is structurally required:

```rust
metadata: MetadataIr
```

while TS says:

```ts
metadata?: ProgramMetadataIR
```

TS field labels accept:

```ts
candid_id?: number
candidId?: number
```

and even allow both to be missing.

The runtime has compatibility logic for both spellings.

Target: **one serialized shape**.

For example:

```json
{
  "kind": "id",
  "candidId": 10
}
```

Only.

My preference for metadata:

```rust
#[serde(
    default,
    skip_serializing_if = "MetadataIr::is_empty"
)]
pub metadata: MetadataIr
```

Then TS correctly uses:

```ts
metadata?: ProgramMetadataIR
```

Add a golden Rust → JSON → TS ProgramIR contract test.

---

### **IR-13 — Add real TS ProgramIR parsing/validation**

**Priority: High**

**Status: [ ] Pending**

Current:

```ts
JSON.parse(this.#inner.irJson()) as ProgramIR
```

Our own architecture document explicitly says not to trust this pattern.

Target:

```ts
parseProgramIR(value: unknown): ProgramIR
```

or:

```ts
validateProgramIR(value: unknown): asserts value is ProgramIR
```

Validate the same important graph invariants as Rust:

```text
version
TypeId references
DeclId references
MethodId references
actor service
oneway returns
field identities
direct structural cycles
```

No need to add Zod as a dependency.

---

### **IR-14 — Preserve actor absence through the runtime**

**Priority: Medium**

**Status: [ ] Pending**

ProgramIR correctly preserves:

```text
no actor != empty service actor
```

But runtime currently always exposes:

```ts
readonly service: ServiceSchema<any>
```

And `irToSchema` always creates:

```ts
service(methods)
```

even with no actor.

Target:

```ts
readonly service: ServiceSchema<any> | null
```

So:

```text
type-only DID
→ service = null

service : {}
→ service = c.service({})
```

---

### **IR-15 — Rewrite `ARCHITECTURE.md` to match the implemented arena**

**Priority: Critical before future Codex feature work**

**Status: [ ] Pending**

Current architecture document still shows the old recursive ProgramIR root and embedded service actor.

Its “future arena” section also describes a `Ref` type node that contradicts the implemented `TypeRefIr` model.

It still describes the generator's old Candid frontend dependency as current legacy debt, although the generator no longer imports those APIs.

Add these hard rules:

> Consumers must not reconstruct a second recursive Candid AST or compatibility IR from ProgramIR merely to preserve an older implementation.

> ProgramIR version numbers represent published serialized contract versions, not internal refactor milestones.

> Numeric IDs are scoped to one exact ProgramIR artifact.

And update all examples to the actual arena shape.

---

# The exact execution order I recommend

```text
IR-01  Method arena
IR-02  Remove redundant DeclId field
IR-03  Strengthen graph invariants
IR-04  Define ID scope

        ↓ ProgramIR shape is frozen

IR-05  Remove Rust compatibility IR
IR-06  Remove TS compatibility IR

        ↓ ProgramIR is genuinely central

IR-07  Semantic analysis layer
IR-08  Semantic parity tests

        ↓ semantics are centralized

IR-09  Lower once
IR-10  Summary from ProgramIR
IR-11  Native reply encoding

        ↓ codec/compiler boundary is clean

IR-12  Exact Rust↔TS serialized contract
IR-13  TS ProgramIR parser/validator
IR-14  Preserve actor absence

        ↓ runtime boundary is clean

IR-15  Rewrite architecture document

        ↓ ready for the next phase
```

One small change from my earlier answer: **IR-15 should actually be updated incrementally after every issue and receive a final full cleanup at the end.** Otherwise Codex may read stale rules halfway through this work.
