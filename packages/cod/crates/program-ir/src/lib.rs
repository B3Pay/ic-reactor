//! Canonical language-neutral Program IR data model.
//!
//! This crate owns the serializable graph types used by Candid lowering and by
//! downstream consumers such as emitters, runtime schemas, forms, workflows,
//! devtools, loader programs, and future compiler passes.
//!
//! The model separates structural type identity (`TypeId`), named declaration
//! identity (`DeclId`), and source-level type uses (`TypeRefIr`). A declaration
//! reference is not a structural type node; it is represented only through
//! `TypeRefIr::Decl`.

use serde::{Deserialize, Serialize};

pub const PROGRAM_IR_VERSION: u16 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProgramIr {
    pub version: u16,
    pub types: Vec<TypeNodeIr>,
    pub declarations: Vec<TypeDeclIr>,
    pub actor: Option<ActorIr>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(transparent)]
pub struct TypeId(pub u32);

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(transparent)]
pub struct DeclId(pub u32);

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(transparent)]
pub struct MethodId(pub u32);

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
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
    #[serde(rename = "type")]
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
pub struct ArgIr {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(rename = "type")]
    pub typ: TypeRefIr,
    pub metadata: MetadataIr,
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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MethodModeIr {
    Query,
    CompositeQuery,
    Update,
    Oneway,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FieldIr {
    pub label: FieldLabelIr,
    #[serde(rename = "type")]
    pub typ: TypeRefIr,
    pub metadata: MetadataIr,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum FieldLabelIr {
    Named { name: String, candid_id: u32 },
    Id { candid_id: u32 },
    Unnamed { candid_id: u32 },
}

impl FieldLabelIr {
    pub fn candid_id(&self) -> u32 {
        match self {
            Self::Named { candid_id, .. }
            | Self::Id { candid_id }
            | Self::Unnamed { candid_id } => *candid_id,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MetadataIr {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub docs: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub raw_docs: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub doc_tags: Vec<DocTag>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocTag {
    pub name: String,
    pub value: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn type_refs_serialize_with_explicit_kind() {
        assert_eq!(
            serde_json::to_value(TypeRefIr::Type { id: TypeId(5) }).unwrap(),
            serde_json::json!({ "kind": "type", "id": 5 })
        );
        assert_eq!(
            serde_json::to_value(TypeRefIr::Decl { id: DeclId(2) }).unwrap(),
            serde_json::json!({ "kind": "decl", "id": 2 })
        );
    }

    #[test]
    fn field_label_carries_candid_id() {
        let label = FieldLabelIr::Named {
            name: "owner".to_string(),
            candid_id: 947_296_307,
        };

        assert_eq!(label.candid_id(), 947_296_307);
    }

    #[test]
    fn program_ir_json_round_trips() {
        let program = ProgramIr {
            version: PROGRAM_IR_VERSION,
            types: vec![TypeNodeIr {
                kind: TypeKindIr::Nat64,
            }],
            declarations: vec![TypeDeclIr {
                id: DeclId(0),
                name: "UserId".to_string(),
                typ: TypeId(0),
                metadata: MetadataIr::default(),
            }],
            actor: None,
        };

        let json = serde_json::to_string(&program).unwrap();
        let round_trip: ProgramIr = serde_json::from_str(&json).unwrap();
        assert_eq!(round_trip, program);
    }
}
