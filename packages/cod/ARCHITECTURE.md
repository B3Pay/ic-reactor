# cod Architecture

> `cod` is the compiler and program-model foundation for the next generation of IC Reactor.

This document defines the architectural boundaries of `cod`.

These rules are not suggestions. They exist to prevent the project from developing multiple competing representations of the same Candid program.

The central architectural rule is:

> **There is one structural interpreter of Candid: the frontend and lowering pipeline. Everything after lowering consumes `ProgramIR`.**

---

## 1. Goals

`cod` provides a language-neutral program model for Candid services.

The same compiled program should eventually support:

- static TypeScript generation
- dynamic actors
- Candid wire encoding and decoding
- schema traversal
- generated forms
- workflow editors
- devtools
- TanStack Query adapters
- IC Reactor clients
- route loaders
- IC-native SSR
- Rust-side program execution and inspection

These features must not independently reinterpret Candid.

They all consume the same canonical program model.

---

## 2. Core Architecture

The compiler pipeline is:

```text
                    Candid source
                         │
                         ▼
                  Candid frontend
             parser + semantic type check
                         │
                         ▼
                      Lowering
                         │
                         ▼
                     ProgramIR
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
        Codec         Emitters       Adapters
          │              │              │
       Candid         TypeScript       Runtime
       bytes          manifests        Forms
                                      Workflows
                                      Devtools
                                      Query
                                      Framework
```

The implementation flow should conceptually be:

```text
Candid source
    ↓
ParsedProgram
    ↓
lower_program(...)
    ↓
ProgramIR
    ↓
compiler passes
    ↓
Canonical ProgramIR
```

After canonical `ProgramIR` exists, no structural consumer may inspect the Candid parser or Candid Rust type environment.

---

## 3. ProgramIR Is the Single Structural Source of Truth

`ProgramIR` describes the program.

It is the canonical structural representation shared by the rest of the project.

At minimum it owns:

```text
ProgramIR
 ├─ version
 ├─ types
 ├─ declarations
 ├─ methods
 └─ actor
     ├─ init arguments
     └─ service TypeId
```

The program root must be versioned.

Conceptually:

```rust
pub const PROGRAM_IR_VERSION: u16 = 1;

pub struct ProgramIr {
    pub version: u16,
    pub types: Vec<TypeNodeIr>,
    pub declarations: Vec<TypeDeclIr>,
    pub methods: Vec<MethodIr>,
    pub actor: Option<ActorIr>,
}
```

The actor is not merely a service.

A Candid service class may contain constructor arguments:

```did
service : (text, opt principal) -> {
  greet : (text) -> (text) query;
}
```

Therefore the actor model must preserve constructor arguments and reference a
service type node:

```rust
pub struct ActorIr {
    pub init_args: Vec<ArgIr>,
    pub service: TypeId,
}
```

The referenced type node must be `TypeKindIr::Service`.

Service type nodes do not embed full method bodies. They preserve source order
by referencing the method arena:

```rust
pub enum TypeKindIr {
    Service {
        methods: Vec<MethodId>,
    },
}
```

`MethodId(n)` means `program.methods[n]` within this exact ProgramIR artifact.

No consumer should need to return to `TypeEnv` to recover actor initialization information.

Absence is represented explicitly. An empty valid Candid structure must never
be used as a sentinel for absence:

```text
no actor != empty service actor
```

For example, a type-only DID has `actor = None` / `actor: null`, while
`service : {}` has an actor with an empty service method list.

---

## 4. Mandatory Compiler Boundary

Only the Candid frontend and lowering implementation may inspect structural Candid compiler types such as:

```text
TypeEnv
Type
TypeInner
IDLProg
IDLMergedProg
IDLType
Binding
```

These types are compiler frontend implementation details.

They may be used for:

- parsing
- Candid type checking
- resolving declarations
- tracing Candid types
- correlating semantic types with source syntax
- preserving source documentation
- lowering into `ProgramIR`

They must not be used by:

- TypeScript emitters
- runtime schema builders
- forms
- workflow generators
- devtools
- TanStack adapters
- React adapters
- route tooling
- SSR tooling
- framework code

The following is forbidden:

```rust
fn generate_typescript(
    env: &TypeEnv,
    actor: &Type,
    prog: &IDLMergedProg,
) -> Result<String>
```

The target architecture is:

```rust
fn generate_typescript(
    program: &ProgramIr,
    config: &GeneratorConfig,
) -> Result<String>
```

A structural consumer that needs `TypeEnv` is usually evidence that the IR is missing information.

Fix the IR or add a compiler pass.

Do not create another interpreter.

---

## 5. The Codec Is Allowed to Retain Candid Internals

`ProgramIR` being central does not mean the Candid Rust implementation must be discarded.

Candid's checked type environment is valuable for:

- typed argument annotation
- Candid wire encoding
- Candid wire decoding
- typed reply decoding

The codec may privately retain:

```text
TypeEnv
actor Type
Candid Function definitions
```

The implemented Rust boundary is:

```rust
pub struct CandidProgram {
    ir: ProgramIr,
    codec: CandidCodec,
}

pub struct CandidCodec {
    env: TypeEnv,
    actor: Option<Type>,
}
```

This separation is intentional:

```text
ProgramIR
    ↓
structural truth

CandidCodec
    ↓
wire implementation
```

`CandidProgram::ir()` returns the cached `ProgramIr` by reference. It must not
re-lower from `TypeEnv`, `Type`, or `IDLMergedProg`. The merged Candid program is
a frontend/lowering input, not part of the compiled program.

The codec must not become a second structural program API.

Forms must not inspect the codec.

Emitters must not inspect the codec.

Framework tooling must not inspect the codec.

---

## 6. ProgramIR Must Be Language-Neutral

The canonical IR must not contain consumer-specific fields.

Forbidden examples include:

```text
tsKey
tsType
reactComponent
formWidget
queryKey
tanstackOptions
hookName
routeLoader
cssClass
```

For example, this does not belong in the canonical IR:

```rust
pub struct CandidFieldIr {
    pub ts_key: String,
}
```

A TypeScript property key is a TypeScript emitter concern.

Instead, the canonical IR should preserve the actual field identity.

Conceptually:

```rust
pub enum CandidFieldLabelIr {
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

For named labels, the Candid numeric field ID is derived from the name using
the Candid label hash. The canonical IR must not store both the name and a
separate named-label ID that can disagree.

A TypeScript emitter can derive:

```text
Named("owner") -> owner
Id(10)         -> _10_
Unnamed(0)     -> _0_
```

Another language is free to derive a different source-level representation.

The IR describes the program.

Adapters describe how a specific ecosystem represents it.

---

## 7. Invalid States Should Be Difficult to Represent

Do not use arbitrary strings for closed language concepts.

Bad:

```rust
pub mode: String
```

Good:

```rust
pub enum CandidMethodModeIr {
    Query,
    CompositeQuery,
    Update,
    Oneway,
}
```

The canonical IR must preserve these modes exactly.

A composite query must not silently become a query.

A oneway method must not silently become an update.

Consumers may reject unsupported modes, but they must not erase semantic information.

The same principle applies to future IR concepts.

Prefer:

```rust
enum
newtype ID
discriminated node
```

over:

```rust
String
unknown map
boolean combinations
```

when the domain has a known closed structure.

---

## 8. ProgramIR Is Versioned and Serializable

`ProgramIR` is intended to cross runtime and language boundaries.

It may eventually be consumed by:

```text
Rust compiler
WASM
TypeScript
generated manifests
Rust canisters
B3Forge
devtools
IC Reactor framework tooling
```

IR types should therefore generally support:

```rust
Serialize
Deserialize
PartialEq
```

The serialized shape becomes a compatibility contract when it is published or
persisted externally.

Any incompatible change to a released or externally persisted contract requires
an explicit IR version decision.

Before the first stable ProgramIR contract is released or persisted externally,
internal redesigns may replace version 1 directly. Do not increment
`PROGRAM_IR_VERSION` merely to mark an unfinished internal refactor milestone.

Do not silently modify the meaning of a released serialized node while keeping
the same IR version.

Consumers of serialized IR must validate the version.

Conceptually:

```ts
function assertProgramVersion(ir: ProgramIR): void {
  if (ir.version !== SUPPORTED_PROGRAM_IR_VERSION) {
    throw new UnsupportedProgramIRVersionError(ir.version)
  }
}
```

Never assume:

```ts
JSON.parse(value) as ProgramIR
```

is automatically a compatible program.

---

## 9. Wire Truth and Semantic Meaning Are Separate

The canonical structural model must preserve Candid wire truth.

Useful application-level interpretations should be modeled as semantic analysis.

For example:

```did
vec nat8
```

The Candid structural truth is:

```text
Vec<Nat8>
```

The semantic interpretation may be:

```text
Blob
```

Likewise:

```did
record {
  text;
  nat;
}
```

The structural truth is:

```text
Record
```

The semantic interpretation may be:

```text
Tuple
```

And:

```did
variant {
  Ok : User;
  Err : Error;
}
```

The structural truth is:

```text
Variant
```

The semantic interpretation may be:

```text
Result<User, Error>
```

The implemented architecture is:

```text
ProgramIR wire structure
          ↓
ProgramSemantics analysis
          ↓
ProgramSemantics
```

`ProgramSemantics` is a separate projection indexed by `TypeId`:

```rust
pub struct ProgramSemantics {
    pub types: Vec<TypeSemantics>,
}
```

Current semantic concepts include:

```rust
pub enum TypeSemanticIr {
    Blob,
    Tuple,
    Result {
        ok_field: u32,
        err_field: u32,
    },
}
```

`ProgramSemantics` is not embedded in `TypeKindIr` and does not change the
serialized ProgramIR version.

The architectural rule is:

> Semantic conveniences must not replace or falsify the underlying Candid contract.

The codec uses wire structure.

Forms may use semantic hints.

The TypeScript emitter may use semantic hints.

Devtools may display both.

---

## 10. Compiler Passes

Program transformation and semantic detection should be explicit compiler passes.

The intended model is:

```text
frontend
    ↓
lower
    ↓
canonicalize
    ↓
validate
    ↓
Canonical ProgramIR
    ↓
semantic analysis
    ↓
ProgramSemantics projection
```

Conceptually:

```rust
let parsed = frontend::candid::parse(source)?;

let mut program = lower::candid::lower(&parsed)?;

passes::canonicalize::run(&mut program)?;
passes::validate::run(&program)?;

let semantics = ProgramSemantics::analyze(&program)?;
```

Examples of pass responsibilities:

### Canonicalization

- normalize method modes
- stabilize declaration ordering where appropriate
- resolve canonical field identities
- remove frontend-only representations
- prepare deterministic artifact-local references

### Semantic analysis

- detect blob-like vectors
- detect tuple-like records
- detect Result-like variants

### Validation

- verify references resolve
- verify IDs are valid
- verify actor service shape when an actor exists
- verify method IDs are unique
- verify oneway methods and function types have no returns
- reject direct structural `TypeRefIr::Type` cycles
- verify the IR version
- verify compiler invariants

Do not hide major semantic transformations inside emitters.

---

## 11. Type Arena and Method Arena

The canonical ProgramIR is an arena-shaped graph using artifact-local IDs.

Conceptually:

```rust
#[serde(transparent)]
pub struct TypeId(pub u32);

#[serde(transparent)]
pub struct DeclId(pub u32);

#[serde(transparent)]
pub struct MethodId(pub u32);
```

And:

```rust
pub struct ProgramIr {
    pub version: u16,
    pub types: Vec<TypeNodeIr>,
    pub declarations: Vec<TypeDeclIr>,
    pub methods: Vec<MethodIr>,
    pub actor: Option<ActorIr>,
}
```

`TypeId(n)`, `DeclId(n)`, and `MethodId(n)` are indexes into the corresponding
arena in one exact ProgramIR artifact. They are not global persistent identities
across independently compiled revisions.

These IDs are only meaningful together with the exact `ProgramIr` value that
allocated them. Persisting a raw `TypeId`, `DeclId`, or `MethodId` without an
external program identity is invalid architecture.

A future durable reference may look like:

```text
ProgramFingerprint + MethodId
```

ProgramIR does not define `ProgramFingerprint` yet.

`DeclId(n)` means `program.declarations[n]`. Declaration entries do not store
their own ID:

```rust
pub struct TypeDeclIr {
    pub name: String,
    pub typ: TypeId,
    pub metadata: MetadataIr,
}
```

Type nodes and service nodes reference other arenas by ID:

```rust
pub enum TypeKindIr {
    Opt {
        inner: TypeRefIr,
    },

    Vec {
        inner: TypeRefIr,
    },

    Record {
        fields: Vec<FieldIr>,
    },

    Variant {
        fields: Vec<FieldIr>,
    },

    Func {
        args: Vec<ArgIr>,
        returns: Vec<ArgIr>,
        mode: CandidMethodModeIr,
    },

    Service {
        methods: Vec<MethodId>,
    },

    // primitives...
}
```

Named declaration references are represented by `TypeRefIr::Decl`, not by a
`TypeKindIr::Ref` node.

Direct `TypeRefIr::Type` edges must be acyclic. Legitimate recursive Candid
structure crosses a declaration boundary:

```text
Type -> Decl -> Type
```

Method bodies live in `ProgramIr.methods`:

```rust
pub struct MethodIr {
    pub name: String,
    pub mode: MethodModeIr,
    pub args: Vec<ArgIr>,
    pub returns: Vec<ArgIr>,
    pub metadata: MetadataIr,
}
```

`MethodId(n)` means `program.methods[n]`. `MethodIr` does not store its own ID.
Service method order is the `Vec<MethodId>` order on the service type node.

Potential advantages include:

- cheaper traversal
- less duplicated structure
- simple memoization
- explicit graph representation
- easier recursion handling
- explicit artifact-local method and type references
- compact manifests
- simpler Rust runtime interpretation

Do not reconstruct a recursive Candid AST or compatibility IR from the arena
just to preserve an older consumer implementation. A small graph/index helper is
allowed; a second structural program model is not.

---

## 12. Generated TypeScript Is an Emitter Output

Generated TypeScript is not the program model.

The TypeScript generator must consume `ProgramIR`.

It must not independently:

- detect tuples from Candid `Field` IDs
- inspect `TypeInner`
- resolve Candid variables
- detect blobs with `Type::is_blob`
- inspect function modes from `FuncMode`
- correlate syntax fields with semantic fields
- traverse `IDLMergedProg`

Those operations belong before or during lowering and compiler passes.

The TypeScript emitter should be boring.

Conceptually:

```rust
fn emit_type_id(
    graph: &ProgramIrGraph<'_>,
    semantics: &ProgramSemantics,
    id: TypeId,
    out: &mut String,
) -> Result<()> {
    match graph.type_kind(id)? {
        TypeKindIr::Null => {
            out.push_str("c.null()");
        }

        TypeKindIr::Bool => {
            out.push_str("c.bool()");
        }

        TypeKindIr::Opt { inner } => {
            out.push_str("c.opt(");
            emit_type_ref(graph, *inner, out)?;
            out.push(')');
        }

        TypeKindIr::Record { fields } => {
            if matches!(semantics.semantic(id)?, Some(TypeSemanticIr::Tuple)) {
                emit_tuple(graph, semantics, fields, out)?;
            } else {
                emit_record(graph, semantics, fields, out)?;
            }
        }

        // ...
    }

    Ok(())
}

fn emit_type_ref(
    graph: &ProgramIrGraph<'_>,
    semantics: &ProgramSemantics,
    reference: TypeRefIr,
    out: &mut String,
) -> Result<()> {
    match reference {
        TypeRefIr::Type { id } => emit_type_id(graph, semantics, id, out),
        TypeRefIr::Decl { id } => emit_declaration_ref(graph, id, out),
    }
}
```

The emitter formats an already-understood program.

It does not understand Candid itself.

The emitter must not first convert `ProgramIR` into an `EmitterProgram`,
`CandidTypeIr`, `GeneratorIR`, or any other recursive compatibility AST. It may
use `ProgramIrGraph` as an index/view over the canonical arenas and
`ProgramSemantics` for shared semantic presentation decisions.

### Hard emitter rule

The final TypeScript emitter should import no structural Candid compiler APIs.

The following imports should not exist in the emitter:

```text
candid::types::Type
candid::types::TypeEnv
candid::types::TypeInner
candid_parser::syntax::IDLType
candid_parser::syntax::IDLMergedProg
```

An architectural test may enforce this boundary.

---

## 13. Runtime Schemas Consume ProgramIR

Dynamic runtime schemas are adapters over the program model.

The intended flow is:

```text
ProgramIR
    ↓
IR schema adapter
    ↓
live c.* schemas
```

The schema runtime must not parse the DID again.

The schema runtime must not inspect Candid Rust types.

The schema runtime must not maintain an independent program AST.

The TypeScript runtime must not reconstruct compatibility models such as:

```text
RuntimeProgramIR
CandidTypeIR
CandidMethodIR
CandidArgIR
CandidFieldIR
```

Runtime adapters should traverse `ProgramIR` through `ProgramIrGraph` and arena
IDs directly:

```ts
irToSchema(ir: ProgramIR)
validateMethodArgs(
  method: ProgramMethodIR,
  graph: ProgramIrGraph,
  semantics: ProgramSemanticsGraph
)
```

For example:

```ts
const schemas = irToSchema(program.ir)
```

is the correct direction.

This adapter may derive JavaScript-specific details such as property keys.

Those derived details must not be written back into canonical `ProgramIR`.

---

## 14. Forms Consume ProgramIR and ProgramSemantics

Forms are not part of the Candid compiler.

A form is a UI projection of a method's input and output types.

The flow is:

```text
ProgramIR
    +
ProgramSemantics
    +
form registry/configuration
    ↓
FormSchema
```

Form concepts such as:

```text
textarea
token input
file picker
date picker
array repeater
variant selector
```

must never be encoded directly in canonical `ProgramIR`.

Candid documentation and structured tags may be preserved as language metadata.

A form adapter may interpret those tags.

For example:

```did
// @label Email
// @format email
email : text;
```

The IR may preserve:

```text
docs
tags
```

The form adapter may derive:

```text
label = "Email"
validation = email
widget = text input
```

That derived UI model belongs to the form layer.

The form adapter may keep a `ProgramIrGraph` index, but it must not rebuild a
recursive form-side Candid AST before producing `FormSchema`:

```ts
programToFormSchema(ir: ProgramIR)
methodToFormSchema(method: MethodId, context: FormContext)
```

---

## 15. Workflows Consume ProgramIR

Workflow nodes are projections of methods.

The flow is:

```text
ProgramIR + MethodId
       ↓
workflow adapter
       ↓
WorkflowMethodNode
```

The workflow system must not independently interpret:

```text
Candid parser AST
TypeEnv
TypeInner
```

A workflow node should reference program and method identity where possible.

Workflow projections should use `MethodId` rather than method name as the
within-program method identity.

Conceptually:

```ts
programToWorkflowSchema(ir: ProgramIR)
methodToWorkflowNode(method: MethodId, context: FormContext)
```

Raw numeric `MethodId` values are scoped to one exact ProgramIR artifact. They
must not be treated as stable persistent identities across contract revisions
without an additional program fingerprint or equivalent versioned program
identity.

Workflow node IDs derived from raw method IDs, such as `method:0`, are therefore
projection-local IDs unless they are paired with a concrete program identity.

Names remain display and source-level identities.

---

## 16. IC Reactor Sits Above cod

`cod` should not become a React library or a TanStack Query library.

The dependency direction is:

```text
cod
 ↓
IC Reactor core
 ↓
query adapter / react adapter
 ↓
framework
```

Conceptually:

```text
cod
 ├─ Candid compiler
 ├─ ProgramIR
 ├─ codec
 └─ schemas

@ic-reactor/core
 ├─ clients
 ├─ transports
 ├─ bound canisters
 └─ callable methods

@ic-reactor/query
 └─ TanStack Query adapters

@ic-reactor/react
 └─ React integration

@ic-reactor/start
 ├─ routes
 ├─ loader programs
 ├─ actions
 └─ hydration / SSR integration
```

`cod` may provide framework-neutral primitives.

It must not import React or TanStack Query.

---

## 17. Methods Are the Primary Application Primitive

The future IC Reactor architecture should be method-first.

A method should eventually provide the structural information needed by adapters:

```text
method identity within one ProgramIR artifact
method name
mode
arguments
returns
documentation
encoding
decoding
call
```

Conceptual TypeScript DX:

```ts
await backend.get_user(10n)
```

The method may also be inspectable:

```ts
backend.get_user.mode
backend.get_user.input
backend.get_user.output
backend.get_user.id
backend.get_user.docs
```

Adapters consume methods:

```ts
backend.get_user.queryOptions(10n)
```

Forms consume method input schemas:

```tsx
<CandidForm schema={backend.save_user.input} onSubmit={backend.save_user} />
```

Future loader programs reference methods:

```ts
query(backend.get_user, params.id)
```

Do not recreate separate query, hook, form, and loader descriptions of the same canister method.

They should project from one method model.

---

## 18. TypeScript Emitter Boundary

The TypeScript emitter consumes:

```text
ProgramIr
ProgramIrGraph
TypeId / DeclId / MethodId
TypeRefIr
ProgramSemantics
```

directly.

It must not inspect Candid frontend or type-checker representations such as:

```text
TypeEnv
TypeInner
IDLType
IDLMergedProg
```

It also must not reconstruct a recursive compatibility model such as:

```text
EmitterProgram
CandidTypeIr
CandidMethodIr
CandidFieldIr
```

The emitter may contain TypeScript-specific formatting logic and derived output
models. It must not create a second structural description of the Candid
program.

Tuple-like record formatting must use `ProgramSemantics`, not a private emitter
predicate. TypeScript-specific surface choices, such as typed-array TypeScript
types for numeric vectors, may remain emitter formatting as long as they do not
pretend to be canonical Candid structure.

```rust
generate_typescript(
    program: &ProgramIr,
    config: &GeneratorConfig,
)
```

The public source/file helpers may still perform:

```text
parse
lower
passes
emit
```

but the emitter itself must receive the canonical program model.

---

## 19. Source Organization Target

The exact files may evolve, but the conceptual module boundaries should move toward:

```text
src/rs/
├── lib.rs
│
├── frontend/
│   ├── mod.rs
│   └── candid.rs
│
├── ir/
│   ├── mod.rs
│   ├── program.rs
│   ├── types.rs
│   ├── method.rs
│   ├── metadata.rs
│   └── ids.rs
│
├── lower/
│   ├── mod.rs
│   ├── candid.rs
│   └── docs.rs
│
├── passes/
│   ├── mod.rs
│   ├── canonicalize.rs
│   ├── semantics.rs
│   └── validate.rs
│
├── codec/
│   ├── mod.rs
│   └── candid.rs
│
├── emit/
│   ├── mod.rs
│   └── typescript.rs
│
├── wasm.rs
└── main.rs
```

Do not create this directory tree merely for aesthetics.

Move code when the corresponding architectural responsibility has actually been separated.

Architecture boundaries matter more than file count.

---

## 20. Review Checklist

Before merging compiler or runtime work, answer these questions.

### Structural truth

- Does this feature derive its structure from `ProgramIR`?
- Is it accidentally creating a second Candid interpreter?
- Is information being recovered from `TypeEnv` after lowering because the IR is incomplete?

### IR purity

- Is a new IR field language-neutral?
- Does it belong to Candid program structure?
- Is it actually TypeScript, React, form, TanStack, or framework metadata?
- Could Rust and TypeScript consume the field without knowing about a UI framework?

### Wire correctness

- Are query, composite query, update, and oneway preserved exactly?
- Are service-class init arguments preserved?
- Are named, numeric, and unnamed field identities preserved?
- Is semantic sugar replacing Candid wire truth?

### Compiler design

- Should this logic be a lowering concern?
- Should this logic be an explicit compiler pass?
- Is an emitter performing semantic detection?
- Is a runtime adapter parsing the source again?

### Future compatibility

- Can forms consume this program?
- Can workflows consume it?
- Can devtools inspect it?
- Can generated TypeScript use it?
- Could a Rust IC-native runtime consume the serialized model?
- Would this design still make sense for IC-native SSR?

When the answer indicates multiple independent representations of the same program, stop and fix the architecture before adding the feature.

---

## 21. The Project Constitution

The shortest version of this document is:

> **Parse Candid once. Lower it once. `ProgramIR` becomes truth.**

> **The codec owns wire implementation, not program structure.**

> **Emitters format the program; they do not understand Candid.**

> **Adapters project the program into forms, workflows, query systems, React, and framework features.**

> **Consumer-specific concepts never leak into the canonical IR.**

> **Preserve Candid wire truth and add semantic meaning separately.**

When uncertain about an architectural change, choose the design that strengthens these boundaries.
