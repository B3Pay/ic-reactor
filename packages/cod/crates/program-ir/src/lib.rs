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

use std::collections::{BTreeMap, BTreeSet};
use std::error::Error;
use std::fmt;

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

impl ProgramIr {
    pub fn graph(&self) -> Result<ProgramIrGraph<'_>, ProgramIrError> {
        ProgramIrGraph::new(self)
    }

    pub fn validate(&self) -> Result<(), ProgramIrError> {
        self.graph().map(|_| ())
    }
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

#[derive(Debug, Clone)]
pub struct ProgramIrGraph<'a> {
    program: &'a ProgramIr,
    declarations_by_id: BTreeMap<DeclId, &'a TypeDeclIr>,
    declarations_by_name: BTreeMap<&'a str, DeclId>,
}

impl<'a> ProgramIrGraph<'a> {
    pub fn new(program: &'a ProgramIr) -> Result<Self, ProgramIrError> {
        let mut declarations_by_id = BTreeMap::new();
        let mut declarations_by_name = BTreeMap::new();

        for (index, declaration) in program.declarations.iter().enumerate() {
            let expected = DeclId(
                u32::try_from(index)
                    .map_err(|_| ProgramIrError::DeclarationIndexExceedsU32 { index })?,
            );
            if declarations_by_id
                .insert(declaration.id, declaration)
                .is_some()
            {
                return Err(ProgramIrError::DuplicateDeclarationId { id: declaration.id });
            }
            if declaration.id != expected {
                return Err(ProgramIrError::NonSequentialDeclarationId {
                    expected,
                    actual: declaration.id,
                });
            }
            if declarations_by_name
                .insert(declaration.name.as_str(), declaration.id)
                .is_some()
            {
                return Err(ProgramIrError::DuplicateDeclarationName {
                    name: declaration.name.clone(),
                });
            }
        }

        let graph = Self {
            program,
            declarations_by_id,
            declarations_by_name,
        };
        graph.validate()?;
        Ok(graph)
    }

    pub fn program(&self) -> &'a ProgramIr {
        self.program
    }

    pub fn types(&self) -> &'a [TypeNodeIr] {
        &self.program.types
    }

    pub fn declarations(&self) -> &'a [TypeDeclIr] {
        &self.program.declarations
    }

    pub fn actor(&self) -> Option<&'a ActorIr> {
        self.program.actor.as_ref()
    }

    pub fn type_node(&self, id: TypeId) -> Result<&'a TypeNodeIr, ProgramIrError> {
        self.program
            .types
            .get(type_index(id)?)
            .ok_or(ProgramIrError::MissingType { id })
    }

    pub fn type_kind(&self, id: TypeId) -> Result<&'a TypeKindIr, ProgramIrError> {
        Ok(&self.type_node(id)?.kind)
    }

    pub fn declaration(&self, id: DeclId) -> Result<&'a TypeDeclIr, ProgramIrError> {
        self.declarations_by_id
            .get(&id)
            .copied()
            .ok_or(ProgramIrError::MissingDeclaration { id })
    }

    pub fn declaration_by_name(&self, name: &str) -> Option<&'a TypeDeclIr> {
        self.declarations_by_name
            .get(name)
            .and_then(|id| self.declaration(*id).ok())
    }

    pub fn resolve_ref(&self, reference: TypeRefIr) -> Result<TypeId, ProgramIrError> {
        match reference {
            TypeRefIr::Type { id } => {
                self.type_node(id)?;
                Ok(id)
            }
            TypeRefIr::Decl { id } => Ok(self.declaration(id)?.typ),
        }
    }

    pub fn resolve_ref_node(&self, reference: TypeRefIr) -> Result<&'a TypeNodeIr, ProgramIrError> {
        self.type_node(self.resolve_ref(reference)?)
    }

    pub fn service_methods(&self, service: TypeId) -> Result<&'a [MethodIr], ProgramIrError> {
        match self.type_kind(service)? {
            TypeKindIr::Service { methods } => Ok(methods),
            _ => Err(ProgramIrError::ActorServiceNotService { id: service }),
        }
    }

    pub fn actor_service(&self) -> Option<&'a [MethodIr]> {
        self.actor().map(|actor| {
            self.service_methods(actor.service)
                .expect("validated ProgramIr actor service must be a service type")
        })
    }

    fn validate(&self) -> Result<(), ProgramIrError> {
        if self.program.version != PROGRAM_IR_VERSION {
            return Err(ProgramIrError::UnsupportedVersion {
                actual: self.program.version,
                expected: PROGRAM_IR_VERSION,
            });
        }

        for declaration in &self.program.declarations {
            self.type_node(declaration.typ)?;
        }

        let mut method_ids = BTreeSet::new();
        for (index, node) in self.program.types.iter().enumerate() {
            let type_id = TypeId(
                u32::try_from(index).map_err(|_| ProgramIrError::TypeIndexExceedsU32 { index })?,
            );
            self.validate_type_kind(type_id, &node.kind, &mut method_ids)?;
        }

        if let Some(actor) = self.program.actor.as_ref() {
            self.validate_args(&actor.init_args)?;
            if !matches!(self.type_kind(actor.service)?, TypeKindIr::Service { .. }) {
                return Err(ProgramIrError::ActorServiceNotService { id: actor.service });
            }
        }

        Ok(())
    }

    fn validate_type_kind(
        &self,
        type_id: TypeId,
        kind: &TypeKindIr,
        method_ids: &mut BTreeSet<MethodId>,
    ) -> Result<(), ProgramIrError> {
        match kind {
            TypeKindIr::Opt { inner } | TypeKindIr::Vec { inner } => {
                self.validate_type_ref(*inner)?;
            }
            TypeKindIr::Record { fields } | TypeKindIr::Variant { fields } => {
                self.validate_fields(type_id, fields)?;
            }
            TypeKindIr::Func { args, returns, .. } => {
                self.validate_args(args)?;
                self.validate_args(returns)?;
            }
            TypeKindIr::Service { methods } => {
                self.validate_methods(type_id, methods, method_ids)?;
            }
            TypeKindIr::Null
            | TypeKindIr::Bool
            | TypeKindIr::Text
            | TypeKindIr::Nat
            | TypeKindIr::Int
            | TypeKindIr::Nat8
            | TypeKindIr::Nat16
            | TypeKindIr::Nat32
            | TypeKindIr::Nat64
            | TypeKindIr::Int8
            | TypeKindIr::Int16
            | TypeKindIr::Int32
            | TypeKindIr::Int64
            | TypeKindIr::Float32
            | TypeKindIr::Float64
            | TypeKindIr::Principal
            | TypeKindIr::Reserved
            | TypeKindIr::Empty => {}
        }

        Ok(())
    }

    fn validate_fields(&self, type_id: TypeId, fields: &[FieldIr]) -> Result<(), ProgramIrError> {
        let mut field_ids = BTreeSet::new();
        for field in fields {
            let candid_id = field.label.candid_id();
            if !field_ids.insert(candid_id) {
                return Err(ProgramIrError::DuplicateFieldId { type_id, candid_id });
            }
            self.validate_type_ref(field.typ)?;
        }
        Ok(())
    }

    fn validate_methods(
        &self,
        service: TypeId,
        methods: &[MethodIr],
        method_ids: &mut BTreeSet<MethodId>,
    ) -> Result<(), ProgramIrError> {
        let mut method_names = BTreeSet::new();
        for method in methods {
            if !method_ids.insert(method.id) {
                return Err(ProgramIrError::DuplicateMethodId { id: method.id });
            }
            if !method_names.insert(method.name.as_str()) {
                return Err(ProgramIrError::DuplicateMethodName {
                    service,
                    name: method.name.clone(),
                });
            }
            self.validate_args(&method.args)?;
            self.validate_args(&method.returns)?;
        }
        Ok(())
    }

    fn validate_args(&self, args: &[ArgIr]) -> Result<(), ProgramIrError> {
        for arg in args {
            self.validate_type_ref(arg.typ)?;
        }
        Ok(())
    }

    fn validate_type_ref(&self, reference: TypeRefIr) -> Result<(), ProgramIrError> {
        match reference {
            TypeRefIr::Type { id } => {
                self.type_node(id)?;
            }
            TypeRefIr::Decl { id } => {
                self.declaration(id)?;
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProgramIrError {
    UnsupportedVersion { actual: u16, expected: u16 },
    TypeIndexExceedsU32 { index: usize },
    DeclarationIndexExceedsU32 { index: usize },
    MissingType { id: TypeId },
    MissingDeclaration { id: DeclId },
    DuplicateDeclarationId { id: DeclId },
    NonSequentialDeclarationId { expected: DeclId, actual: DeclId },
    DuplicateDeclarationName { name: String },
    ActorServiceNotService { id: TypeId },
    DuplicateMethodId { id: MethodId },
    DuplicateMethodName { service: TypeId, name: String },
    DuplicateFieldId { type_id: TypeId, candid_id: u32 },
}

impl fmt::Display for ProgramIrError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedVersion { actual, expected } => {
                write!(
                    f,
                    "unsupported ProgramIR version {actual}; expected {expected}"
                )
            }
            Self::TypeIndexExceedsU32 { index } => {
                write!(f, "ProgramIR type index {index} exceeds u32")
            }
            Self::DeclarationIndexExceedsU32 { index } => {
                write!(f, "ProgramIR declaration index {index} exceeds u32")
            }
            Self::MissingType { id } => write!(f, "missing ProgramIR type node {id:?}"),
            Self::MissingDeclaration { id } => {
                write!(f, "missing ProgramIR declaration {id:?}")
            }
            Self::DuplicateDeclarationId { id } => {
                write!(f, "duplicate ProgramIR declaration id {id:?}")
            }
            Self::NonSequentialDeclarationId { expected, actual } => write!(
                f,
                "non-sequential ProgramIR declaration id: expected {expected:?}, got {actual:?}"
            ),
            Self::DuplicateDeclarationName { name } => {
                write!(f, "duplicate ProgramIR declaration name `{name}`")
            }
            Self::ActorServiceNotService { id } => {
                write!(
                    f,
                    "ProgramIR actor service points to non-service type {id:?}"
                )
            }
            Self::DuplicateMethodId { id } => {
                write!(f, "duplicate ProgramIR method id {id:?}")
            }
            Self::DuplicateMethodName { service, name } => write!(
                f,
                "duplicate ProgramIR method name `{name}` in service {service:?}"
            ),
            Self::DuplicateFieldId { type_id, candid_id } => write!(
                f,
                "duplicate ProgramIR field candid id {candid_id} in type {type_id:?}"
            ),
        }
    }
}

impl Error for ProgramIrError {}

fn type_index(id: TypeId) -> Result<usize, ProgramIrError> {
    usize::try_from(id.0).map_err(|_| ProgramIrError::MissingType { id })
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

    #[test]
    fn graph_resolves_type_and_declaration_references() {
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

        let graph = program.graph().unwrap();

        assert_eq!(
            graph
                .resolve_ref(TypeRefIr::Type { id: TypeId(0) })
                .unwrap(),
            TypeId(0)
        );
        assert_eq!(
            graph
                .resolve_ref(TypeRefIr::Decl { id: DeclId(0) })
                .unwrap(),
            TypeId(0)
        );
        assert_eq!(graph.declaration(DeclId(0)).unwrap().name, "UserId");
        assert_eq!(graph.declaration_by_name("UserId").unwrap().id, DeclId(0));
    }

    #[test]
    fn graph_returns_validated_actor_service_methods() {
        let program = ProgramIr {
            version: PROGRAM_IR_VERSION,
            types: vec![TypeNodeIr {
                kind: TypeKindIr::Service {
                    methods: vec![method(0, "ping")],
                },
            }],
            declarations: vec![],
            actor: Some(ActorIr {
                init_args: vec![],
                service: TypeId(0),
            }),
        };

        let graph = program.graph().unwrap();
        let methods = graph.actor_service().unwrap();

        assert_eq!(methods.len(), 1);
        assert_eq!(methods[0].name, "ping");
    }

    #[test]
    fn graph_validation_rejects_missing_type_ids() {
        let program = ProgramIr {
            version: PROGRAM_IR_VERSION,
            types: vec![],
            declarations: vec![TypeDeclIr {
                id: DeclId(0),
                name: "Missing".to_string(),
                typ: TypeId(7),
                metadata: MetadataIr::default(),
            }],
            actor: None,
        };

        assert_eq!(
            program.validate().unwrap_err(),
            ProgramIrError::MissingType { id: TypeId(7) }
        );
    }

    #[test]
    fn graph_validation_rejects_duplicate_declaration_ids() {
        let program = ProgramIr {
            version: PROGRAM_IR_VERSION,
            types: vec![TypeNodeIr {
                kind: TypeKindIr::Nat,
            }],
            declarations: vec![
                TypeDeclIr {
                    id: DeclId(0),
                    name: "A".to_string(),
                    typ: TypeId(0),
                    metadata: MetadataIr::default(),
                },
                TypeDeclIr {
                    id: DeclId(0),
                    name: "B".to_string(),
                    typ: TypeId(0),
                    metadata: MetadataIr::default(),
                },
            ],
            actor: None,
        };

        assert_eq!(
            program.validate().unwrap_err(),
            ProgramIrError::DuplicateDeclarationId { id: DeclId(0) }
        );
    }

    #[test]
    fn graph_validation_rejects_duplicate_declaration_names() {
        let program = ProgramIr {
            version: PROGRAM_IR_VERSION,
            types: vec![TypeNodeIr {
                kind: TypeKindIr::Nat,
            }],
            declarations: vec![
                TypeDeclIr {
                    id: DeclId(0),
                    name: "Name".to_string(),
                    typ: TypeId(0),
                    metadata: MetadataIr::default(),
                },
                TypeDeclIr {
                    id: DeclId(1),
                    name: "Name".to_string(),
                    typ: TypeId(0),
                    metadata: MetadataIr::default(),
                },
            ],
            actor: None,
        };

        assert_eq!(
            program.validate().unwrap_err(),
            ProgramIrError::DuplicateDeclarationName {
                name: "Name".to_string(),
            }
        );
    }

    #[test]
    fn graph_validation_rejects_non_service_actor_target() {
        let program = ProgramIr {
            version: PROGRAM_IR_VERSION,
            types: vec![TypeNodeIr {
                kind: TypeKindIr::Text,
            }],
            declarations: vec![],
            actor: Some(ActorIr {
                init_args: vec![],
                service: TypeId(0),
            }),
        };

        assert_eq!(
            program.validate().unwrap_err(),
            ProgramIrError::ActorServiceNotService { id: TypeId(0) }
        );
    }

    #[test]
    fn graph_validation_rejects_duplicate_method_ids() {
        let program = ProgramIr {
            version: PROGRAM_IR_VERSION,
            types: vec![
                TypeNodeIr {
                    kind: TypeKindIr::Service {
                        methods: vec![method(0, "a")],
                    },
                },
                TypeNodeIr {
                    kind: TypeKindIr::Service {
                        methods: vec![method(0, "b")],
                    },
                },
            ],
            declarations: vec![],
            actor: None,
        };

        assert_eq!(
            program.validate().unwrap_err(),
            ProgramIrError::DuplicateMethodId { id: MethodId(0) }
        );
    }

    #[test]
    fn graph_validation_rejects_duplicate_field_ids() {
        let program = ProgramIr {
            version: PROGRAM_IR_VERSION,
            types: vec![
                TypeNodeIr {
                    kind: TypeKindIr::Record {
                        fields: vec![
                            named_field("a", 42, TypeRefIr::Type { id: TypeId(1) }),
                            named_field("b", 42, TypeRefIr::Type { id: TypeId(1) }),
                        ],
                    },
                },
                TypeNodeIr {
                    kind: TypeKindIr::Text,
                },
            ],
            declarations: vec![],
            actor: None,
        };

        assert_eq!(
            program.validate().unwrap_err(),
            ProgramIrError::DuplicateFieldId {
                type_id: TypeId(0),
                candid_id: 42,
            }
        );
    }

    fn method(id: u32, name: &str) -> MethodIr {
        MethodIr {
            id: MethodId(id),
            name: name.to_string(),
            mode: MethodModeIr::Query,
            args: vec![],
            returns: vec![],
            metadata: MetadataIr::default(),
        }
    }

    fn named_field(name: &str, candid_id: u32, typ: TypeRefIr) -> FieldIr {
        FieldIr {
            label: FieldLabelIr::Named {
                name: name.to_string(),
                candid_id,
            },
            typ,
            metadata: MetadataIr::default(),
        }
    }
}
