# COD Type Arena Design Notes

> Status: architecture design for arena-shaped Program IR.
>
> This document defines the intended type-arena model before implementation.
> It is not a compatibility contract for the current recursive Program IR.

## Goal

Program IR must become a deterministic, serializable, language-neutral graph that can serve as the structural foundation for:

- TypeScript emission
- runtime schemas
- forms
- workflows
- devtools
- loader programs
- call graphs
- IC-native SSR
- future compiler passes

The current recursive IR is a useful first implementation, but it mixes several independent concepts:

- named Candid declarations
- structural Candid types
- references to declarations
- semantic conveniences such as `Blob`

Program IR must separate those concepts.

The central model is:

```text
                 ProgramIR
                     │
          ┌──────────┼──────────┐
          │          │          │
          ▼          ▼          ▼
      Type Arena  Declarations  Actor
          │          │          │
        TypeId      DeclId    service TypeId
          │          │
          └──── TypeRefIr ──────┘
```

---

# Design Laws

These rules define the architecture.

## 1. TypeId identifies a structural type node

A `TypeId` identifies one node in the Program IR type arena.

Examples of structural types:

```text
nat64

opt text

vec nat8

record {
  owner : principal
}

variant {
  Ok : nat
  Err : text
}

func (...) -> (...)

service {
  get : ...
}
```

A `TypeId` does not represent a Candid declaration name.

---

## 2. DeclId identifies a named Candid declaration

Given:

```did
type UserId = nat64;
type TransactionId = nat64;
```

`UserId` and `TransactionId` are different declarations.

They may point to the same structural type:

```text
DeclId(0) UserId
    │
    ▼
TypeId(0) Nat64

DeclId(1) TransactionId
    │
    └────────► TypeId(0) Nat64
```

Therefore:

> Structural type identity and declaration identity are different concepts.

This distinction is useful for:

- generated type names
- documentation
- forms
- devtools
- workflows
- diagnostics
- source-level inspection

It must not affect Candid wire compatibility.

---

## 3. TypeRefIr preserves declaration use

A Candid type use can refer directly to a structural type:

```did
get : (nat64) -> ();
```

or through a named declaration:

```did
type UserId = nat64;

get : (UserId) -> ();
```

Both use the same structural Candid type.

They are not the same source-level representation.

Program IR preserves this using `TypeRefIr`.

Conceptually:

```rust
pub enum TypeRefIr {
    Type {
        id: TypeId,
    },

    Decl {
        id: DeclId,
    },
}
```

Therefore:

```did
get : (nat64) -> ();
```

may lower to:

```text
TypeRef::Type(TypeId(0))
```

while:

```did
get : (UserId) -> ();
```

lowers to:

```text
TypeRef::Decl(DeclId(0))
```

A consumer interested only in wire structure can resolve both to a `TypeId`.

A consumer interested in source declaration identity can preserve the declaration.

---

## 4. Named references are not type nodes

Program IR must not contain:

```rust
TypeKindIr::Ref {
    name: String,
}
```

or:

```rust
TypeKindIr::Ref {
    declaration: DeclId,
}
```

A named declaration reference is not a structural Candid type.

It is a relationship between a type use and a declaration.

Therefore named references belong in:

```text
TypeRefIr
```

and not:

```text
TypeKindIr
```

This is a core architectural rule.

---

## 5. Recursion is represented using declaration references

Current Program IR may lower:

```rust
TypeInner::Knot(id)
```

to:

```rust
CandidTypeIr::Ref {
    name: id.to_string(),
}
```

This leaks a parser implementation detail into canonical Program IR.

Program IR must never expose parser `Knot` IDs as declaration names.

Recursive relationships must resolve to `DeclId`.

Example:

```did
type List = opt record {
  head : nat;
  tail : List;
};
```

Representation:

```text
Decl 0 List
   │
   ▼
Type 2 Opt
   │
   ▼
Type 1 Record
   ├── head ──► Type 0 Nat
   │
   └── tail ──► Decl 0 List
                     │
                     └──── back to Type 2
```

The recursion exists in the Program IR graph.

There is no recursive Rust object graph and no string-based type lookup.

---

## 6. The type arena contains wire structure

The type arena should describe Candid structural truth.

It must not contain language-specific or UI-specific concepts.

Never add concepts such as:

```text
typescriptName
zodSchema
reactWidget
formInput
tanstackKey
```

to type nodes.

Semantic conveniences must also remain conceptually separate from wire structure.

For example:

```did
blob
```

has Candid wire structure equivalent to:

```did
vec nat8
```

Therefore Program IR should structurally represent it as:

```text
Vec
 └── Nat8
```

A future semantic pass may annotate that node as:

```text
Blob
```

The same principle applies to:

```text
Tuple
Result
```

Wire structure and semantic interpretation are separate layers.

---

# Proposed Program IR Shape

The intended model is approximately:

```rust
pub const PROGRAM_IR_VERSION: u16 = 2;

#[derive(
    Debug,
    Clone,
    Serialize,
    Deserialize,
    PartialEq,
)]
#[serde(rename_all = "camelCase")]
pub struct ProgramIr {
    pub version: u16,
    pub types: Vec<TypeNodeIr>,
    pub declarations: Vec<TypeDeclIr>,
    pub actor: Option<ActorIr>,
}
```

The `types` field is now a type arena.

It no longer contains named declarations.

Named declarations live separately in `declarations`.

---

# IDs

IDs must use dedicated Rust types.

Do not use raw `u32` throughout the compiler.

```rust
#[derive(
    Debug,
    Clone,
    Copy,
    Serialize,
    Deserialize,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
)]
#[serde(transparent)]
pub struct TypeId(pub u32);
```

```rust
#[derive(
    Debug,
    Clone,
    Copy,
    Serialize,
    Deserialize,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
)]
#[serde(transparent)]
pub struct DeclId(pub u32);
```

```rust
#[derive(
    Debug,
    Clone,
    Copy,
    Serialize,
    Deserialize,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
)]
#[serde(transparent)]
pub struct MethodId(pub u32);
```

Initial recommendation:

```text
TypeId   = yes
DeclId   = yes
MethodId = yes
FieldId  = no, unless a concrete consumer requires it
```

Do not create IDs merely for architectural symmetry.

---

# Type References

```rust
#[derive(
    Debug,
    Clone,
    Copy,
    Serialize,
    Deserialize,
    PartialEq,
    Eq,
    Hash,
)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TypeRefIr {
    Type {
        id: TypeId,
    },

    Decl {
        id: DeclId,
    },
}
```

The serialized form should make the distinction explicit.

Example:

```json
{
  "kind": "type",
  "id": 5
}
```

and:

```json
{
  "kind": "decl",
  "id": 2
}
```

Do not serialize these as ambiguous raw numbers.

---

# Type Arena Nodes

```rust
#[derive(
    Debug,
    Clone,
    Serialize,
    Deserialize,
    PartialEq,
)]
#[serde(rename_all = "camelCase")]
pub struct TypeNodeIr {
    pub kind: TypeKindIr,
}
```

The first arena implementation should remain intentionally minimal.

Additional node metadata or semantic annotations should only be added when the corresponding compiler phase exists.

---

# Structural Type Kinds

```rust
#[derive(
    Debug,
    Clone,
    Serialize,
    Deserialize,
    PartialEq,
)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TypeKindIr {
    Null,
    Bool,
    Text,

    Nat,
    Int,

    Nat8,
    Nat16,
    Nat32,
    Nat64,

    Int8,
    Int16,
    Int32,
    Int64,

    Float32,
    Float64,

    Principal,
    Reserved,
    Empty,

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
        mode: MethodModeIr,
    },

    Service {
        methods: Vec<MethodIr>,
    },
}
```

Program IR should initially have no:

```text
Blob
Ref
Tuple
Result
```

structural variants.

Reason:

```text
Blob   = semantic interpretation of Vec<Nat8>
Tuple  = semantic interpretation of Record
Result = semantic interpretation of Variant
Ref    = declaration use, represented by TypeRefIr
```

---

# Named Declarations

```rust
#[derive(
    Debug,
    Clone,
    Serialize,
    Deserialize,
    PartialEq,
)]
#[serde(rename_all = "camelCase")]
pub struct TypeDeclIr {
    pub id: DeclId,
    pub name: String,
    #[serde(rename = "type")]
    pub typ: TypeId,
    pub metadata: MetadataIr,
}
```

A declaration owns:

```text
identity
name
target structural type
metadata
```

It does not recursively contain the type structure.

Given:

```did
type UserId = nat64;
type TransactionId = nat64;
```

Program IR may contain:

```text
Declarations
------------

Decl 0
  name = UserId
  type = Type 0

Decl 1
  name = TransactionId
  type = Type 0


Types
-----

Type 0
  Nat64
```

This is valid.

Declaration identity is preserved while structural type identity is shared.

---

# Metadata

Current Program IR repeats:

```rust
docs
raw_docs
doc_tags
```

on several structures.

These should be combined.

```rust
#[derive(
    Debug,
    Clone,
    Default,
    Serialize,
    Deserialize,
    PartialEq,
)]
#[serde(rename_all = "camelCase")]
pub struct MetadataIr {
    #[serde(
        default,
        skip_serializing_if = "Vec::is_empty"
    )]
    pub docs: Vec<String>,

    #[serde(
        default,
        skip_serializing_if = "Vec::is_empty"
    )]
    pub raw_docs: Vec<String>,

    #[serde(
        default,
        skip_serializing_if = "Vec::is_empty"
    )]
    pub doc_tags: Vec<DocTag>,
}
```

Use:

```rust
metadata: MetadataIr
```

on:

```text
TypeDeclIr
MethodIr
ArgIr
FieldIr
```

`raw_docs` may eventually be removed.

Do not remove it as part of the initial arena migration unless there is a separate explicit decision.

The arena migration should not unnecessarily combine unrelated metadata redesign.

---

# Arguments

```rust
#[derive(
    Debug,
    Clone,
    Serialize,
    Deserialize,
    PartialEq,
)]
#[serde(rename_all = "camelCase")]
pub struct ArgIr {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,

    #[serde(rename = "type")]
    pub typ: TypeRefIr,

    pub metadata: MetadataIr,
}
```

Candid argument names are source/documentation information.

Argument names must never affect:

```text
wire encoding
structural type equality
method signature compatibility
```

Consumers must not use argument names as part of Candid type identity.

---

# Fields

```rust
#[derive(
    Debug,
    Clone,
    Serialize,
    Deserialize,
    PartialEq,
)]
#[serde(rename_all = "camelCase")]
pub struct FieldIr {
    pub label: FieldLabelIr,

    #[serde(rename = "type")]
    pub typ: TypeRefIr,

    pub metadata: MetadataIr,
}
```

The current IR stores:

```rust
label
candid_id
```

independently.

That permits conceptually invalid state where the label and Candid ID disagree.

The Candid ID should be part of field-label identity.

Recommended model:

```rust
#[derive(
    Debug,
    Clone,
    Serialize,
    Deserialize,
    PartialEq,
    Eq,
)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum FieldLabelIr {
    Named {
        name: String,
        candid_id: u32,
    },

    Id {
        candid_id: u32,
    },

    Unnamed {
        candid_id: u32,
    },
}
```

Provide a helper:

```rust
impl FieldLabelIr {
    pub fn candid_id(&self) -> u32 {
        match self {
            Self::Named {
                candid_id,
                ..
            }
            | Self::Id {
                candid_id,
            }
            | Self::Unnamed {
                candid_id,
            } => *candid_id,
        }
    }
}
```

This keeps the label and numeric Candid identity together.

Example:

```text
Named {
  name: "owner",
  candid_id: 947296307
}
```

---

# Methods

```rust
#[derive(
    Debug,
    Clone,
    Serialize,
    Deserialize,
    PartialEq,
)]
#[serde(rename_all = "camelCase")]
pub struct MethodIr {
    pub id: MethodId,
    pub name: String,
    pub mode: MethodModeIr,
    pub args: Vec<ArgIr>,
    pub returns: Vec<ArgIr>,
    pub metadata: MetadataIr,
}
```

`MethodId` is globally unique within one Program IR.

This is useful for future compiler models:

```text
CallIr {
  method: MethodId
}
```

rather than requiring:

```text
service TypeId + string method name
```

Future consumers likely to reference methods include:

- loader graphs
- workflow nodes
- call graphs
- devtools
- static SSR analysis

A method name alone is not global identity.

Example:

```did
type Ledger = service {
  get : () -> ();
};

type UserService = service {
  get : () -> ();
};
```

Both contain a method named `get`.

They are different methods.

---

# Method Modes

```rust
#[derive(
    Debug,
    Clone,
    Copy,
    Serialize,
    Deserialize,
    PartialEq,
    Eq,
)]
#[serde(rename_all = "snake_case")]
pub enum MethodModeIr {
    Query,
    CompositeQuery,
    Update,
    Oneway,
}
```

The exact mode must remain preserved.

A `oneway` method must have no return values.

This should eventually be validated as a Program IR invariant even though the Candid frontend already performs language checking.

Program IR must protect its own validity.

---

# Actor

The actor should not embed a second service structure.

Current shape:

```text
Actor
  ├── init args
  └── ServiceIr {
        methods
      }
```

But `Service` is already a Candid structural type.

Program IR should use:

```rust
#[derive(
    Debug,
    Clone,
    Serialize,
    Deserialize,
    PartialEq,
)]
#[serde(rename_all = "camelCase")]
pub struct ActorIr {
    pub init_args: Vec<ArgIr>,
    pub service: TypeId,
}
```

The referenced type node must be:

```rust
TypeKindIr::Service { .. }
```

Example:

```did
type Backend = service {
  get : () -> (text) query;
};

service : Backend;
```

Representation:

```text
Declarations
------------

Decl 0 Backend
    │
    ▼
Type 1 Service
  └── get


Actor
-----

service ─────────► Type 1
```

The actor and declaration share the same structural service node.

There is no duplicated service model.

A validation pass must reject:

```text
actor.service -> Record
```

or any non-service type.

---

# Why Service Remains a TypeKind

Candid service references are valid type values.

Example:

```did
type Ledger = service {
  balance : () -> (nat) query;
};
```

Therefore service structure genuinely belongs in the Candid type system.

The type arena must contain:

```rust
TypeKindIr::Service {
    methods: Vec<MethodIr>,
}
```

The root actor then references one service type.

---

# Recursive Type Lowering

Arena lowering requires declaration reservation before declaration bodies are lowered.

Consider:

```did
type List = opt record {
  head : nat;
  tail : List;
};
```

## Phase 1: reserve declarations

Before lowering the body:

```text
DeclId(0) = List
```

The declaration identity now exists.

Its final target `TypeId` does not need to be known yet.

## Phase 2: lower declaration bodies

Allocate:

```text
Type 0
  Nat
```

Then:

```text
Type 1
  Record
    head -> Type 0
    tail -> Decl 0
```

Then:

```text
Type 2
  Opt
    inner -> Type 1
```

Finally complete the declaration:

```text
Decl 0 List -> Type 2
```

Complete graph:

```text
Decl 0 List
   │
   ▼
Type 2 Opt
   │
   ▼
Type 1 Record
   ├── head ──► Type 0 Nat
   │
   └── tail ──► Decl 0
                     │
                     └────► Type 2
```

No parser Knot identity enters Program IR.

---

# Mutually Recursive Types

Consider:

```did
type A = record {
  b : opt B;
};

type B = record {
  a : opt A;
};
```

Declaration reservation:

```text
Decl 0 = A
Decl 1 = B
```

Only after both IDs exist are bodies lowered.

Lowering `A` may safely emit:

```text
Decl 1
```

for `B`.

Lowering `B` may safely emit:

```text
Decl 0
```

for `A`.

This requires a multi-phase lowerer.

A naive recursive `type_ir(...) -> CandidTypeIr` function is no longer the correct architecture.

---

# Lowering Context

The arena migration should introduce a compiler lowering context.

Conceptually:

```rust
struct LoweringContext<'a> {
    env: &'a TypeEnv,
    prog: &'a IDLMergedProg,

    types: Vec<TypeNodeIr>,
    declarations: Vec<TypeDeclIr>,

    declarations_by_name:
        BTreeMap<String, DeclId>,

    next_method_id: u32,
}
```

The exact source syntax mappings may require additional internal fields.

Those are lowering implementation details.

They must not enter Program IR.

Suggested API:

```rust
impl<'a> LoweringContext<'a> {
    fn new(
        env: &'a TypeEnv,
        prog: &'a IDLMergedProg,
    ) -> Self;

    fn reserve_declarations(
        &mut self,
    ) -> Result<()>;

    fn lower_declaration_bodies(
        &mut self,
    ) -> Result<()>;

    fn lower_actor(
        &mut self,
        actor: Option<&Type>,
    ) -> Result<Option<ActorIr>>;

    fn finish(
        self,
        actor: Option<ActorIr>,
    ) -> ProgramIr;
}
```

Top-level lowering should conceptually become:

```rust
pub fn program_ir_from_parts(
    env: &TypeEnv,
    actor: Option<&Type>,
    prog: &IDLMergedProg,
) -> Result<ProgramIr> {
    let mut lowerer =
        LoweringContext::new(env, prog);

    lowerer.reserve_declarations()?;
    lowerer.lower_declaration_bodies()?;

    let actor =
        lowerer.lower_actor(actor)?;

    let mut program =
        lowerer.finish(actor);

    passes::canonicalize::run(
        &mut program,
    )?;

    passes::validate::run(
        &program,
    )?;

    Ok(program)
}
```

The exact module structure may be introduced incrementally.

The important architectural point is:

> Arena construction requires compiler state.

Do not force the existing stateless recursive helper model onto the arena design.

---

# Arena Allocation

Type node allocation should use checked ID conversion.

Conceptually:

```rust
impl LoweringContext<'_> {
    fn alloc_type(
        &mut self,
        kind: TypeKindIr,
    ) -> Result<TypeId> {
        let index =
            u32::try_from(self.types.len())
                .context(
                    "ProgramIR type arena exceeds u32",
                )?;

        let id = TypeId(index);

        self.types.push(
            TypeNodeIr {
                kind,
            },
        );

        Ok(id)
    }
}
```

Do not use:

```rust
self.types.len() as u32
```

Compiler identity allocation should not silently truncate.

The same applies to:

```text
DeclId
MethodId
```

---

# Initial Arena Interning Policy

Program IR should not initially perform composite structural interning.

Given:

```did
service : {
  a : (record { value : text }) -> ();
  b : (record { value : text }) -> ();
}
```

the initial arena may contain:

```text
Type 3
  Record {
    value -> Text
  }

Type 5
  Record {
    value -> Text
  }
```

even though the records are structurally equivalent.

This is intentional.

Reasons:

- simpler lowering
- easier recursion handling
- clearer debugging
- deterministic construction
- fewer concerns combined in the first arena migration

The rule is:

> Arena first. Structural interning later.

A future compiler pass may perform structural deduplication.

For example:

```text
passes::deduplicate_types
```

only if the optimization proves useful.

---

# Primitive Reuse

Primitive reuse is allowed during lowering.

For example, every encountered `nat64` may reference one shared:

```text
TypeId(0) Nat64
```

A small primitive cache can avoid unnecessary arena growth.

Conceptually:

```rust
primitive_types:
    BTreeMap<PrimitiveKind, TypeId>
```

Do not extend this into arbitrary composite structural interning during the initial arena migration.

Recommended policy:

```text
primitive reuse      = yes
composite interning  = no
```

---

# Determinism

Canonical Program IR must be deterministic.

Desired property:

```text
same checked Candid program
            │
            ▼
same canonical Program IR
```

Program IR must not depend on hash-map iteration order.

Deterministic concerns include:

```text
declaration order
field order
service method order
TypeId assignment
DeclId assignment
MethodId assignment
```

The lowering stage does not need to solve every canonical-ID concern itself.

Recommended pipeline:

```text
Candid frontend
      │
      ▼
provisional lowering
      │
      ▼
Program IR graph
      │
      ▼
canonicalization pass
      │
      ▼
validation pass
      │
      ▼
canonical Program IR
```

A canonicalization pass may remap:

```text
old TypeId   -> canonical TypeId
old DeclId   -> canonical DeclId
old MethodId -> canonical MethodId
```

All references must be rewritten consistently.

Do not expose provisional Program IR through the public compiler API.

---

# Program IR Validation

Program IR must validate its own graph.

The Candid frontend validating source does not remove the need for Program IR invariants.

A future validation pass should check at least:

```text
all TypeIds exist

all DeclIds exist

all MethodIds are unique

all declaration IDs are unique

all declaration names are unique

every TypeRef::Type resolves

every TypeRef::Decl resolves

actor.service exists

actor.service points to Service

oneway methods have zero return values

record field Candid IDs are unique

variant field Candid IDs are unique
```

Diagnostics should identify exact IR identities.

Example:

```text
ProgramIR actor service TypeId(17)
points to `record`; expected `service`
```

Another example:

```text
ProgramIR MethodId(8) is duplicated
```

Another:

```text
TypeId(13) record contains duplicate
Candid field ID 947296307
```

Validation belongs in a compiler pass.

Emitters and adapters must not independently enforce structural IR correctness.

---

# Compiler Pipeline

The intended architecture is:

```text
Candid source
      │
      ▼
frontend::candid::parse
      │
      ▼
checked Candid frontend model
      │
      ▼
lower::candid
      │
      ▼
provisional Program IR
      │
      ▼
passes::canonicalize
      │
      ▼
passes::semantics
      │
      ▼
passes::validate
      │
      ▼
canonical Program IR
```

For the first Type Arena migration:

```text
lowering
canonicalization
validation
```

are the priority.

Semantic passes may initially remain deferred.

Do not implement all future compiler passes during the first arena migration.

---

# Semantic Layer

Program IR structural type nodes should eventually support semantic interpretation.

Candidate semantics:

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

Potential node shape:

```rust
pub struct TypeNodeIr {
    pub kind: TypeKindIr,

    pub semantics:
        Vec<TypeSemanticIr>,
}
```

The semantic representation is not finalized by this document.

Important rule:

> Semantic recognition is a compiler pass over structural Program IR.

The lowerer should not directly produce:

```text
Blob
Tuple
Result
```

as wire-type kinds.

Examples:

```text
Vec<Nat8>
    │
    └── semantic pass
            │
            ▼
          Blob
```

```text
Record {
  0 : A
  1 : B
}
    │
    └── semantic pass
            │
            ▼
          Tuple
```

```text
Variant {
  Ok  : A
  Err : B
}
    │
    └── semantic pass
            │
            ▼
          Result
```

Semantic annotations must not replace structural wire truth.

---

# Fixture 1: Declaration Identity

Input:

```did
type UserId = nat64;
type TransactionId = nat64;
```

Expected conceptual graph:

```text
Declarations
------------

Decl 0 UserId
  -> Type 0

Decl 1 TransactionId
  -> Type 0


Types
-----

Type 0
  Nat64


Actor
-----

none
```

Required property:

```text
Decl 0 != Decl 1
```

while:

```text
resolve(Decl 0) == Type 0
resolve(Decl 1) == Type 0
```

---

# Fixture 2: Recursive Type

Input:

```did
type List = opt record {
  head : nat;
  tail : List;
};
```

Expected conceptual graph:

```text
Declarations
------------

Decl 0 List
  -> Type 2


Types
-----

Type 0
  Nat

Type 1
  Record
    head
      -> Type 0

    tail
      -> Decl 0

Type 2
  Opt
    inner
      -> Type 1


Actor
-----

none
```

Required property:

```text
tail is a declaration reference
```

and not:

```text
Ref("List")
Ref("0")
```

---

# Fixture 3: Mutual Recursion

Input:

```did
type A = record {
  b : opt B;
};

type B = record {
  a : opt A;
};
```

Expected conceptual graph:

```text
Declarations
------------

Decl 0 A
  -> Type 1

Decl 1 B
  -> Type 3


Types
-----

Type 0
  Opt
    inner -> Decl 1

Type 1
  Record
    b -> Type 0

Type 2
  Opt
    inner -> Decl 0

Type 3
  Record
    a -> Type 2


Actor
-----

none
```

Exact TypeId ordering may differ before canonicalization.

The important graph identity is:

```text
A -> B -> A
```

through `DeclId`.

---

# Fixture 4: Named Service Actor

Input:

```did
type Backend = service {
  get : () -> (text) query;
};

service : Backend;
```

Expected conceptual graph:

```text
Declarations
------------

Decl 0 Backend
  -> Type 1


Types
-----

Type 0
  Text

Type 1
  Service
    Method 0 get
      mode = Query
      args = []
      returns = [
        Type 0
      ]


Actor
-----

init args = []

service -> Type 1
```

Required property:

```text
Actor.service
```

and:

```text
Backend declaration
```

resolve to the same service type node.

The service structure must not be duplicated.

---

# Fixture 5: Repeated Anonymous Types

Input:

```did
service : {
  a : (record { value : text }) -> ();
  b : (record { value : text }) -> ();
}
```

Expected initial arena behavior:

```text
Types
-----

Type 0
  Text

Type 1
  Record
    value -> Type 0

Type 2
  Record
    value -> Type 0

Type 3
  Service
    Method 0 a
      args -> Type 1

    Method 1 b
      args -> Type 2


Actor
-----

service -> Type 3
```

Required initial policy:

```text
Type 1 != Type 2
```

even though they are structurally equivalent.

Composite structural interning is deferred.

---

# Required Initial Tests

Before considering arena Program IR complete, tests should prove:

## Declaration identity

```did
type UserId = nat64;
type TransactionId = nat64;
```

Both declarations exist separately.

Both may resolve to the same primitive TypeId.

---

## Direct type vs declaration reference

Given:

```did
type UserId = nat64;

service : {
  direct : (nat64) -> ();
  named : (UserId) -> ();
}
```

Expected:

```text
direct arg
    TypeRef::Type(...)

named arg
    TypeRef::Decl(...)
```

Both ultimately resolve to `Nat64`.

---

## Recursive type

A recursive declaration uses `DeclId`.

No string reference exists in canonical IR.

No parser Knot ID exists in canonical IR.

---

## Mutual recursion

Two reserved declarations may reference each other during body lowering.

---

## Type-only DID

```did
type User = record {
  name : text;
};
```

Expected:

```text
actor = None / null
```

Declarations and structural types remain available.

---

## Empty actor

```did
service : {};
```

Expected:

```text
actor = Some
```

Actor service references a real empty `Service` type node.

No actor and empty actor remain structurally distinct.

---

## Named service actor

A named service declaration and actor may reference the same service TypeId.

---

## Service class

```did
service : (
  text,
  opt principal,
) -> {
  greet : (text) -> (text) query;
};
```

Expected:

```text
Actor.init_args
```

preserved.

Actor service is a TypeId pointing to `Service`.

---

## Oneway invariant

All `Oneway` methods contain:

```text
returns = []
```

Validation rejects manually constructed Program IR with non-empty oneway returns.

---

## Repeated anonymous composite types

Initial lowering does not require structural deduplication.

---

## JSON round trip

Program IR must:

```text
serialize
deserialize
compare equal
```

with all ID references preserved.

---

## Deterministic compilation

Compiling the same DID repeatedly must produce identical serialized canonical Program IR.

---

# Migration Constraints

The Type Arena migration must not:

```text
add React code

add TanStack Query code

add Start/SSR code

redesign forms

redesign workflows

implement structural type deduplication

replace the Candid parser

replace the Candid wire codec

add TypeScript-specific fields to Program IR
```

The migration goal is only:

```text
recursive declaration-tree IR
            │
            ▼
graph-based type arena IR
```

Everything else is secondary.

---

# Consumer Rule

After arena Program IR exists, every structural consumer must resolve types through Program IR.

Conceptually:

```rust
impl ProgramIr {
    pub fn type_node(
        &self,
        id: TypeId,
    ) -> Result<&TypeNodeIr>;

    pub fn declaration(
        &self,
        id: DeclId,
    ) -> Result<&TypeDeclIr>;

    pub fn resolve_type_ref(
        &self,
        reference: TypeRefIr,
    ) -> Result<TypeId>;
}
```

Equivalent TypeScript helpers should exist.

Consumers must not independently create local declaration-resolution rules.

The Program IR module owns graph resolution semantics.

---

# Final Architecture Rule

Program IR must make these statements true:

```text
A type is structure.

A declaration is a name for structure.

A type reference preserves how structure was referenced.

Recursion is graph identity.

An actor references a service type.

Semantics are analysis over wire structure.

Consumers interpret Program IR, never Candid parser internals.
```

That is the intended foundation for COD's compiler architecture.
