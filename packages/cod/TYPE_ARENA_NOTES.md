# Type Arena Notes

The type arena is a data structure that stores all the types used in a program. It is designed to support efficient type checking and type inference, as well as to enable the generation of Candid declarations from the program's types.

## The Laws

1. TypeId identifies a structural type node.
2. DeclId identifies a named Candid declaration.
3. Structural type identity and declaration identity are separate.
4. TypeRefIr preserves whether a type use refers directly to a structural type or through a named declaration.
5. Named references are not TypeKindIr nodes.
6. Recursion is represented through declaration references, never parser Knot IDs or string names.

```rs
pub const PROGRAM_IR_VERSION: u16 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProgramIr {
    pub version: u16,
    pub types: Vec<TypeNodeIr>,
    pub declarations: Vec<TypeDeclIr>,
    pub actor: Option<ActorIr>,
}

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
    Type { id: TypeId },
    Decl { id: DeclId },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TypeNodeIr {
    pub kind: TypeKindIr,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TypeDeclIr {
    pub id: DeclId,
    pub name: String,
    pub typ: TypeId,
    pub metadata: MetadataIr,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActorIr {
    pub init_args: Vec<ArgIr>,
    pub service: TypeId,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MethodIr {
    pub id: MethodId,
    pub name: String,
    pub mode: MethodModeIr,
    pub args: Vec<ArgIr>,
    pub returns: Vec<ArgIr>,
    pub metadata: MetadataIr,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArgIr {
    pub name: Option<String>,
    pub typ: TypeRefIr,
    pub metadata: MetadataIr,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FieldIr {
    pub label: FieldLabelIr,
    pub typ: TypeRefIr,
    pub metadata: MetadataIr,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub docs: Vec<String>,

    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub raw_docs: Vec<String>,

    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub doc_tags: Vec<DocTag>,
}
```
