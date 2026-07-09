# IC Reactor Program IR

This crate owns the canonical, serializable Program IR data model used by
`@ic-reactor/cod`.

The Program IR is a deterministic, language-neutral graph. It is intended to be
the structural foundation for TypeScript emission, runtime schemas, forms,
workflows, devtools, loader programs, call graphs, IC-native SSR, and future
compiler passes.

## Design Rules

1. `TypeId` identifies one structural type node in the type arena of one exact
   Program IR artifact.
2. `DeclId` identifies one named Candid declaration in one exact Program IR
   artifact.
3. `TypeRefIr` represents a type use and preserves whether source syntax used a
   structural type directly or referred to a named declaration.
4. Named references are not type nodes. They appear only as `TypeRefIr::Decl`.
5. Recursion is represented through declaration references, not parser knot IDs
   or string refs.
6. Direct `TypeRefIr::Type` edges are acyclic. Legitimate recursion must pass
   through `TypeRefIr::Decl`.
7. Named field labels store the source name only; their Candid numeric field ID
   is derived from that name.
8. The type arena stores wire structure. Semantic conveniences such as blob,
   tuple, and result are analysis layered on top of structural wire truth.
9. Primitive type reuse is allowed. Composite structural interning is deferred.
10. `MethodId` identifies one method body in the method arena of one exact
    Program IR artifact. Service type nodes store ordered `MethodId`
    references.
11. Graph validation and ID resolution are owned by this crate.

## Serialized JSON Contract

The Rust serde model defines the canonical Program IR JSON shape. TypeScript
types mirror that shape exactly.

Rust structs store metadata as concrete `MetadataIr` values so compiler code can
avoid nullable metadata internally. The serialized contract omits empty
metadata and deserializes missing metadata back to `MetadataIr::default()`.
Non-empty metadata uses `docs`, `rawDocs`, and `docTags`.

Numeric and unnamed field labels serialize their field ID as `candidId`. Named
field labels serialize only `name`; their numeric Candid field ID is derived
from that name. The serialized contract does not include legacy aliases such as
`candid_id`.

## Graph Shape

```text
Program IR
    │
    ├── Type Arena
    │      └── TypeId -> TypeNodeIr
    │
    ├── Declarations
    │      └── DeclId(index) -> declarations[index] -> name + target TypeId
    │
    ├── Methods
    │      └── MethodId -> method name + signature + metadata
    │
    └── Actor
           └── service TypeId
```

## Identity Model

Two declarations may point at the same structural type:

```did
type UserId = nat64;
type TransactionId = nat64;
```

Conceptually:

```text
declarations[0] UserId        -> TypeId(0) Nat64
declarations[1] TransactionId -> TypeId(0) Nat64
```

`DeclId(n)` is the arena index `program.declarations[n]`. `TypeDeclIr` does
not store a redundant `id` field.

## ID Scope

`TypeId`, `DeclId`, and `MethodId` are local to one exact serialized
`ProgramIr` value.

For example, `MethodId(7)` means:

```text
program.methods[7] in this ProgramIr artifact
```

It does not mean:

```text
the permanent identity of that Candid method across future compilations
```

Any durable reference across contract revisions must pair the raw ID with an
external program identity, such as a future program fingerprint. ProgramIR does
not define that persistent identity yet.

## Reference Model

Direct source syntax:

```did
direct : (nat64) -> ();
```

uses:

```text
TypeRefIr::Type { id: ... }
```

Named source syntax:

```did
type UserId = nat64;
named : (UserId) -> ();
```

uses:

```text
TypeRefIr::Decl { id: ... }
```

Consumers that only care about wire structure can resolve either reference to a
`TypeId`. Consumers that care about source declarations can preserve `DeclId`.

## Graph API

Consumers should use `ProgramIr::graph()` instead of creating local lookup maps.
The graph resolver validates the Program IR before exposing borrowed accessors:

- `type_node(TypeId)`
- `declaration(DeclId)`
- `declaration_id_by_name(name)`
- `declaration_by_name(name)`
- `method(MethodId)`
- `resolve_ref(TypeRefIr) -> TypeId`
- `service_method_ids(TypeId)`
- `service_methods(TypeId)`
- `actor_service_method_ids()`
- `actor_service_methods()`

Validation currently checks version support, declaration name uniqueness,
missing type/declaration/method references, actor service targets, oneway
method/function return invariants, duplicate method references, duplicate
method names per service, unreferenced methods, direct structural type cycles,
and duplicate field candid IDs inside record and variant nodes.

## Semantic Analysis

Consumers that need application-level interpretations should use
`ProgramIr::semantics()` or `ProgramSemantics::analyze(&program)`.

`ProgramSemantics` is indexed by `TypeId`:

```rust
pub struct ProgramSemantics {
    pub types: Vec<TypeSemantics>,
}

pub struct TypeSemantics {
    pub semantic: Option<TypeSemanticIr>,
}
```

The initial semantic set is:

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

This analysis is derived from structural Program IR. A `vec nat8` remains
`TypeKindIr::Vec`; a tuple-like record remains `TypeKindIr::Record`; a
Result-like variant remains `TypeKindIr::Variant`.

## Initial Lowering Policy

The first arena lowerer should:

- reserve all declarations in source order before lowering declaration bodies
- allocate type IDs with checked `u32` conversion
- allocate method IDs with checked `u32` conversion and store service method
  order as `MethodId` references
- reuse primitive type nodes
- allocate separate composite nodes for repeated anonymous composites
- preserve named type uses as `TypeRefIr::Decl`
- keep semantic annotations out of the initial structural lowering

Composite deduplication, semantic recognition, and canonical ID remapping remain
separate compiler passes.
