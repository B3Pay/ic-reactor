# IC Reactor Program IR

This crate owns the canonical, serializable Program IR data model used by
`@ic-reactor/cod`.

The Program IR is a deterministic, language-neutral graph. It is intended to be
the structural foundation for TypeScript emission, runtime schemas, forms,
workflows, devtools, loader programs, call graphs, IC-native SSR, and future
compiler passes.

## Design Rules

1. `TypeId` identifies one structural type node in the type arena.
2. `DeclId` identifies one named Candid declaration.
3. `TypeRefIr` represents a type use and preserves whether source syntax used a
   structural type directly or referred to a named declaration.
4. Named references are not type nodes. They appear only as `TypeRefIr::Decl`.
5. Recursion is represented through declaration references, not parser knot IDs
   or string refs.
6. The type arena stores wire structure. Semantic conveniences such as blob,
   tuple, and result are analysis layered on top of structural wire truth.
7. Primitive type reuse is allowed. Composite structural interning is deferred.
8. Graph validation and ID resolution are owned by this crate.

## Graph Shape

```text
Program IR
    │
    ├── Type Arena
    │      └── TypeId -> TypeNodeIr
    │
    ├── Declarations
    │      └── DeclId -> declaration name + target TypeId
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
DeclId(0) UserId        -> TypeId(0) Nat64
DeclId(1) TransactionId -> TypeId(0) Nat64
```

This preserves source-level declaration identity without changing Candid wire
compatibility.

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
- `declaration_by_name(name)`
- `resolve_ref(TypeRefIr) -> TypeId`
- `service_methods(TypeId)`
- `actor_service()`

Validation currently checks version support, declaration ID/name uniqueness,
sequential declaration IDs, missing type/declaration references, actor service
targets, duplicate method IDs/names, and duplicate field candid IDs inside
record and variant nodes.

## Initial Lowering Policy

The first arena lowerer should:

- reserve all declarations in source order before lowering declaration bodies
- allocate type IDs with checked `u32` conversion
- reuse primitive type nodes
- allocate separate composite nodes for repeated anonymous composites
- preserve named type uses as `TypeRefIr::Decl`
- keep semantic annotations out of the initial structural lowering

Composite deduplication, semantic recognition, and canonical ID remapping remain
separate compiler passes.
