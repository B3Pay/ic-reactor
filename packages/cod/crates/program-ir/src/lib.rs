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
    pub methods: Vec<MethodIr>,
    pub actor: Option<ActorIr>,
}

impl ProgramIr {
    pub fn graph(&self) -> Result<ProgramIrGraph<'_>, ProgramIrError> {
        ProgramIrGraph::new(self)
    }

    pub fn semantics(&self) -> Result<ProgramSemantics, ProgramIrError> {
        ProgramSemantics::analyze(self)
    }

    pub fn validate(&self) -> Result<(), ProgramIrError> {
        self.graph().map(|_| ())
    }
}

/// Structural type node identity local to one exact `ProgramIr` artifact.
///
/// The raw numeric value is not a persistent identity across independently
/// compiled artifacts.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(transparent)]
pub struct TypeId(pub u32);

/// Named Candid declaration identity local to one exact `ProgramIr` artifact.
///
/// The raw numeric value is not a persistent identity across independently
/// compiled artifacts.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(transparent)]
pub struct DeclId(pub u32);

/// Method arena identity local to one exact `ProgramIr` artifact.
///
/// The raw numeric value is not a persistent identity across independently
/// compiled artifacts.
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
        methods: Vec<MethodId>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TypeDeclIr {
    pub name: String,
    #[serde(rename = "type")]
    pub typ: TypeId,
    #[serde(default, skip_serializing_if = "MetadataIr::is_empty")]
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
    #[serde(default, skip_serializing_if = "MetadataIr::is_empty")]
    pub metadata: MetadataIr,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MethodIr {
    pub name: String,
    pub mode: MethodModeIr,
    pub args: Vec<ArgIr>,
    pub returns: Vec<ArgIr>,
    #[serde(default, skip_serializing_if = "MetadataIr::is_empty")]
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
    #[serde(default, skip_serializing_if = "MetadataIr::is_empty")]
    pub metadata: MetadataIr,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum FieldLabelIr {
    Named {
        name: String,
    },
    Id {
        #[serde(rename = "candidId")]
        candid_id: u32,
    },
    Unnamed {
        #[serde(rename = "candidId")]
        candid_id: u32,
    },
}

impl FieldLabelIr {
    pub fn candid_id(&self) -> u32 {
        match self {
            Self::Named { name } => candid_label_id(name),
            Self::Id { candid_id } | Self::Unnamed { candid_id } => *candid_id,
        }
    }
}

/// Computes the Candid numeric field identifier for a named label.
///
/// This is the language-neutral Candid label hash: start at zero, then for each
/// UTF-8 byte multiply by 223 and add the byte modulo 2^32.
pub fn candid_label_id(name: &str) -> u32 {
    name.as_bytes().iter().fold(0u32, |hash, byte| {
        hash.wrapping_mul(223).wrapping_add(u32::from(*byte))
    })
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

impl MetadataIr {
    pub fn is_empty(&self) -> bool {
        self.docs.is_empty() && self.raw_docs.is_empty() && self.doc_tags.is_empty()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocTag {
    pub name: String,
    pub value: String,
}

/// Language-neutral semantic projection over structural ProgramIR.
///
/// Semantics are derived from the wire graph and indexed by `TypeId`. They do
/// not replace `TypeKindIr`, which remains the canonical Candid wire shape.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProgramSemantics {
    pub types: Vec<TypeSemantics>,
}

impl ProgramSemantics {
    pub fn analyze(program: &ProgramIr) -> Result<Self, ProgramIrError> {
        let graph = program.graph()?;
        let mut types = Vec::with_capacity(graph.types().len());

        for node in graph.types() {
            types.push(TypeSemantics {
                semantic: detect_type_semantic(&graph, &node.kind)?,
            });
        }

        Ok(Self { types })
    }

    pub fn type_semantics(&self, id: TypeId) -> Result<&TypeSemantics, ProgramIrError> {
        self.types
            .get(type_index(id)?)
            .ok_or(ProgramIrError::MissingType { id })
    }

    pub fn semantic(&self, id: TypeId) -> Result<Option<&TypeSemanticIr>, ProgramIrError> {
        Ok(self.type_semantics(id)?.semantic.as_ref())
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TypeSemantics {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub semantic: Option<TypeSemanticIr>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TypeSemanticIr {
    Blob,
    Tuple,
    Result {
        #[serde(rename = "okField")]
        ok_field: u32,
        #[serde(rename = "errField")]
        err_field: u32,
    },
}

fn detect_type_semantic(
    graph: &ProgramIrGraph<'_>,
    kind: &TypeKindIr,
) -> Result<Option<TypeSemanticIr>, ProgramIrError> {
    Ok(match kind {
        TypeKindIr::Vec { inner } if is_blob_inner(graph, *inner)? => Some(TypeSemanticIr::Blob),
        TypeKindIr::Record { fields } if fields_are_tuple(fields) => Some(TypeSemanticIr::Tuple),
        TypeKindIr::Variant { fields } => result_semantic(fields),
        _ => None,
    })
}

fn is_blob_inner(graph: &ProgramIrGraph<'_>, inner: TypeRefIr) -> Result<bool, ProgramIrError> {
    Ok(matches!(
        graph.type_kind(graph.resolve_ref(inner)?)?,
        TypeKindIr::Nat8
    ))
}

fn fields_are_tuple(fields: &[FieldIr]) -> bool {
    !fields.is_empty()
        && fields.iter().enumerate().all(|(index, field)| {
            matches!(field.label, FieldLabelIr::Unnamed { candid_id } if candid_id == index as u32)
        })
}

fn result_semantic(fields: &[FieldIr]) -> Option<TypeSemanticIr> {
    if fields.len() != 2 {
        return None;
    }

    let mut ok_field = None;
    let mut err_field = None;
    for field in fields {
        let FieldLabelIr::Named { name } = &field.label else {
            return None;
        };
        match name.to_ascii_lowercase().as_str() {
            "ok" => ok_field = Some(field.label.candid_id()),
            "err" => err_field = Some(field.label.candid_id()),
            _ => return None,
        }
    }

    Some(TypeSemanticIr::Result {
        ok_field: ok_field?,
        err_field: err_field?,
    })
}

#[derive(Debug, Clone)]
pub struct ProgramIrGraph<'a> {
    program: &'a ProgramIr,
    declarations_by_name: BTreeMap<&'a str, DeclId>,
}

impl<'a> ProgramIrGraph<'a> {
    pub fn new(program: &'a ProgramIr) -> Result<Self, ProgramIrError> {
        let mut declarations_by_name = BTreeMap::new();

        for (index, declaration) in program.declarations.iter().enumerate() {
            let id = DeclId(
                u32::try_from(index)
                    .map_err(|_| ProgramIrError::DeclarationIndexExceedsU32 { index })?,
            );
            if declarations_by_name
                .insert(declaration.name.as_str(), id)
                .is_some()
            {
                return Err(ProgramIrError::DuplicateDeclarationName {
                    name: declaration.name.clone(),
                });
            }
        }

        let graph = Self {
            program,
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

    pub fn methods(&self) -> &'a [MethodIr] {
        &self.program.methods
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
        self.program
            .declarations
            .get(decl_index(id)?)
            .ok_or(ProgramIrError::MissingDeclaration { id })
    }

    pub fn declaration_id_by_name(&self, name: &str) -> Option<DeclId> {
        self.declarations_by_name.get(name).copied()
    }

    pub fn declaration_by_name(&self, name: &str) -> Option<&'a TypeDeclIr> {
        self.declaration_id_by_name(name)
            .and_then(|id| self.declaration(id).ok())
    }

    pub fn method(&self, id: MethodId) -> Result<&'a MethodIr, ProgramIrError> {
        self.program
            .methods
            .get(method_index(id)?)
            .ok_or(ProgramIrError::MissingMethod { id })
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

    pub fn service_method_ids(&self, service: TypeId) -> Result<&'a [MethodId], ProgramIrError> {
        match self.type_kind(service)? {
            TypeKindIr::Service { methods } => Ok(methods),
            _ => Err(ProgramIrError::ActorServiceNotService { id: service }),
        }
    }

    pub fn service_methods(&self, service: TypeId) -> Result<Vec<&'a MethodIr>, ProgramIrError> {
        self.service_method_ids(service)?
            .iter()
            .map(|id| self.method(*id))
            .collect()
    }

    pub fn actor_service_method_ids(&self) -> Option<&'a [MethodId]> {
        self.actor().map(|actor| {
            self.service_method_ids(actor.service)
                .expect("validated ProgramIr actor service must be a service type")
        })
    }

    pub fn actor_service_methods(&self) -> Option<Vec<&'a MethodIr>> {
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

        for (index, method) in self.program.methods.iter().enumerate() {
            let id = MethodId(
                u32::try_from(index)
                    .map_err(|_| ProgramIrError::MethodIndexExceedsU32 { index })?,
            );
            self.validate_method_signature(id, method)?;
        }

        let mut referenced_method_ids = BTreeSet::new();
        for (index, node) in self.program.types.iter().enumerate() {
            let type_id = TypeId(
                u32::try_from(index).map_err(|_| ProgramIrError::TypeIndexExceedsU32 { index })?,
            );
            self.validate_type_kind(type_id, &node.kind, &mut referenced_method_ids)?;
        }

        for (index, _) in self.program.methods.iter().enumerate() {
            let id = MethodId(
                u32::try_from(index)
                    .map_err(|_| ProgramIrError::MethodIndexExceedsU32 { index })?,
            );
            if !referenced_method_ids.contains(&id) {
                return Err(ProgramIrError::UnreferencedMethod { id });
            }
        }

        if let Some(actor) = self.program.actor.as_ref() {
            self.validate_args(&actor.init_args)?;
            if !matches!(self.type_kind(actor.service)?, TypeKindIr::Service { .. }) {
                return Err(ProgramIrError::ActorServiceNotService { id: actor.service });
            }
        }

        self.validate_no_direct_type_cycles()?;

        Ok(())
    }

    fn validate_type_kind(
        &self,
        type_id: TypeId,
        kind: &TypeKindIr,
        referenced_method_ids: &mut BTreeSet<MethodId>,
    ) -> Result<(), ProgramIrError> {
        match kind {
            TypeKindIr::Opt { inner } | TypeKindIr::Vec { inner } => {
                self.validate_type_ref(*inner)?;
            }
            TypeKindIr::Record { fields } | TypeKindIr::Variant { fields } => {
                self.validate_fields(type_id, fields)?;
            }
            TypeKindIr::Func {
                args,
                returns,
                mode,
            } => {
                self.validate_args(args)?;
                self.validate_args(returns)?;
                if *mode == MethodModeIr::Oneway && !returns.is_empty() {
                    return Err(ProgramIrError::OnewayFuncTypeHasReturns {
                        id: type_id,
                        returns: returns.len(),
                    });
                }
            }
            TypeKindIr::Service { methods } => {
                self.validate_service_method_ids(type_id, methods, referenced_method_ids)?;
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

    fn validate_method_signature(
        &self,
        id: MethodId,
        method: &MethodIr,
    ) -> Result<(), ProgramIrError> {
        self.validate_args(&method.args)?;
        self.validate_args(&method.returns)?;
        if method.mode == MethodModeIr::Oneway && !method.returns.is_empty() {
            return Err(ProgramIrError::OnewayMethodHasReturns {
                id,
                returns: method.returns.len(),
            });
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

    fn validate_service_method_ids(
        &self,
        service: TypeId,
        method_ids: &[MethodId],
        referenced_method_ids: &mut BTreeSet<MethodId>,
    ) -> Result<(), ProgramIrError> {
        let mut method_names = BTreeSet::new();
        for id in method_ids {
            if !referenced_method_ids.insert(*id) {
                return Err(ProgramIrError::DuplicateMethodReference { id: *id });
            }
            let method = self.method(*id)?;
            if !method_names.insert(method.name.as_str()) {
                return Err(ProgramIrError::DuplicateMethodName {
                    service,
                    name: method.name.clone(),
                });
            }
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

    fn validate_no_direct_type_cycles(&self) -> Result<(), ProgramIrError> {
        let mut states = vec![TypeVisitState::Unvisited; self.program.types.len()];
        for index in 0..self.program.types.len() {
            let id = TypeId(
                u32::try_from(index).map_err(|_| ProgramIrError::TypeIndexExceedsU32 { index })?,
            );
            self.visit_direct_type_edges(id, &mut states)?;
        }
        Ok(())
    }

    fn visit_direct_type_edges(
        &self,
        id: TypeId,
        states: &mut [TypeVisitState],
    ) -> Result<(), ProgramIrError> {
        let index = type_index(id)?;
        match states
            .get_mut(index)
            .ok_or(ProgramIrError::MissingType { id })?
        {
            state @ TypeVisitState::Unvisited => {
                *state = TypeVisitState::Visiting;
            }
            TypeVisitState::Visiting => {
                return Err(ProgramIrError::DirectTypeCycle { id });
            }
            TypeVisitState::Visited => {
                return Ok(());
            }
        }

        match self.type_kind(id)? {
            TypeKindIr::Opt { inner } | TypeKindIr::Vec { inner } => {
                self.visit_direct_type_ref(*inner, states)?;
            }
            TypeKindIr::Record { fields } | TypeKindIr::Variant { fields } => {
                for field in fields {
                    self.visit_direct_type_ref(field.typ, states)?;
                }
            }
            TypeKindIr::Func { args, returns, .. } => {
                self.visit_direct_args(args, states)?;
                self.visit_direct_args(returns, states)?;
            }
            TypeKindIr::Service { methods } => {
                for id in methods {
                    let method = self.method(*id)?;
                    self.visit_direct_args(&method.args, states)?;
                    self.visit_direct_args(&method.returns, states)?;
                }
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

        states[index] = TypeVisitState::Visited;
        Ok(())
    }

    fn visit_direct_args(
        &self,
        args: &[ArgIr],
        states: &mut [TypeVisitState],
    ) -> Result<(), ProgramIrError> {
        for arg in args {
            self.visit_direct_type_ref(arg.typ, states)?;
        }
        Ok(())
    }

    fn visit_direct_type_ref(
        &self,
        reference: TypeRefIr,
        states: &mut [TypeVisitState],
    ) -> Result<(), ProgramIrError> {
        if let TypeRefIr::Type { id } = reference {
            self.visit_direct_type_edges(id, states)?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TypeVisitState {
    Unvisited,
    Visiting,
    Visited,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProgramIrError {
    UnsupportedVersion { actual: u16, expected: u16 },
    TypeIndexExceedsU32 { index: usize },
    DeclarationIndexExceedsU32 { index: usize },
    MethodIndexExceedsU32 { index: usize },
    MissingType { id: TypeId },
    MissingDeclaration { id: DeclId },
    MissingMethod { id: MethodId },
    DuplicateDeclarationName { name: String },
    ActorServiceNotService { id: TypeId },
    OnewayMethodHasReturns { id: MethodId, returns: usize },
    OnewayFuncTypeHasReturns { id: TypeId, returns: usize },
    DirectTypeCycle { id: TypeId },
    DuplicateMethodReference { id: MethodId },
    DuplicateMethodName { service: TypeId, name: String },
    UnreferencedMethod { id: MethodId },
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
            Self::MethodIndexExceedsU32 { index } => {
                write!(f, "ProgramIR method index {index} exceeds u32")
            }
            Self::MissingType { id } => write!(f, "missing ProgramIR type node {id:?}"),
            Self::MissingDeclaration { id } => {
                write!(f, "missing ProgramIR declaration {id:?}")
            }
            Self::MissingMethod { id } => {
                write!(f, "missing ProgramIR method {id:?}")
            }
            Self::DuplicateDeclarationName { name } => {
                write!(f, "duplicate ProgramIR declaration name `{name}`")
            }
            Self::ActorServiceNotService { id } => {
                write!(
                    f,
                    "ProgramIR actor service points to non-service type {id:?}"
                )
            }
            Self::OnewayMethodHasReturns { id, returns } => write!(
                f,
                "ProgramIR oneway method {id:?} has {returns} return value(s)"
            ),
            Self::OnewayFuncTypeHasReturns { id, returns } => write!(
                f,
                "ProgramIR oneway function type {id:?} has {returns} return value(s)"
            ),
            Self::DirectTypeCycle { id } => write!(
                f,
                "ProgramIR direct structural type cycle reaches {id:?}; recursion must pass through a declaration reference"
            ),
            Self::DuplicateMethodReference { id } => {
                write!(f, "duplicate ProgramIR method reference {id:?}")
            }
            Self::DuplicateMethodName { service, name } => write!(
                f,
                "duplicate ProgramIR method name `{name}` in service {service:?}"
            ),
            Self::UnreferencedMethod { id } => {
                write!(f, "ProgramIR method {id:?} is not referenced by a service")
            }
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

fn decl_index(id: DeclId) -> Result<usize, ProgramIrError> {
    usize::try_from(id.0).map_err(|_| ProgramIrError::MissingDeclaration { id })
}

fn method_index(id: MethodId) -> Result<usize, ProgramIrError> {
    usize::try_from(id.0).map_err(|_| ProgramIrError::MissingMethod { id })
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
    fn named_field_label_derives_candid_id() {
        let label = FieldLabelIr::Named {
            name: "owner".to_string(),
        };

        assert_eq!(label.candid_id(), 947_296_307);
        assert_eq!(candid_label_id("owner"), 947_296_307);
        assert_eq!(
            serde_json::to_value(label).unwrap(),
            serde_json::json!({ "kind": "named", "name": "owner" })
        );
    }

    #[test]
    fn numeric_field_labels_serialize_with_camel_case_candid_id() {
        assert_eq!(
            serde_json::to_value(FieldLabelIr::Id { candid_id: 10 }).unwrap(),
            serde_json::json!({ "kind": "id", "candidId": 10 })
        );
        assert_eq!(
            serde_json::to_value(FieldLabelIr::Unnamed { candid_id: 0 }).unwrap(),
            serde_json::json!({ "kind": "unnamed", "candidId": 0 })
        );

        let label: FieldLabelIr =
            serde_json::from_value(serde_json::json!({ "kind": "id", "candidId": 42 })).unwrap();
        assert_eq!(label, FieldLabelIr::Id { candid_id: 42 });
        let legacy = serde_json::from_value::<FieldLabelIr>(
            serde_json::json!({ "kind": "id", "candid_id": 42 }),
        );
        assert!(legacy.is_err());
    }

    #[test]
    fn program_ir_json_round_trips() {
        let program = ProgramIr {
            version: PROGRAM_IR_VERSION,
            types: vec![TypeNodeIr {
                kind: TypeKindIr::Nat64,
            }],
            declarations: vec![TypeDeclIr {
                name: "UserId".to_string(),
                typ: TypeId(0),
                metadata: MetadataIr::default(),
            }],
            methods: vec![],
            actor: None,
        };

        let json = serde_json::to_string(&program).unwrap();
        let round_trip: ProgramIr = serde_json::from_str(&json).unwrap();
        assert_eq!(round_trip, program);
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(
            value["declarations"][0],
            serde_json::json!({
                "name": "UserId",
                "type": 0,
            })
        );
    }

    #[test]
    fn empty_metadata_is_optional_in_json_contract() {
        let program = ProgramIr {
            version: PROGRAM_IR_VERSION,
            types: vec![
                TypeNodeIr {
                    kind: TypeKindIr::Nat64,
                },
                TypeNodeIr {
                    kind: TypeKindIr::Record {
                        fields: vec![FieldIr {
                            label: FieldLabelIr::Named {
                                name: "id".to_string(),
                            },
                            typ: TypeRefIr::Type { id: TypeId(0) },
                            metadata: MetadataIr::default(),
                        }],
                    },
                },
                TypeNodeIr {
                    kind: TypeKindIr::Service {
                        methods: vec![MethodId(0)],
                    },
                },
            ],
            declarations: vec![TypeDeclIr {
                name: "UserId".to_string(),
                typ: TypeId(0),
                metadata: MetadataIr::default(),
            }],
            methods: vec![MethodIr {
                name: "save".to_string(),
                mode: MethodModeIr::Update,
                args: vec![ArgIr {
                    name: None,
                    typ: TypeRefIr::Type { id: TypeId(1) },
                    metadata: MetadataIr::default(),
                }],
                returns: vec![],
                metadata: MetadataIr::default(),
            }],
            actor: Some(ActorIr {
                init_args: vec![ArgIr {
                    name: None,
                    typ: TypeRefIr::Type { id: TypeId(0) },
                    metadata: MetadataIr::default(),
                }],
                service: TypeId(2),
            }),
        };

        let value = serde_json::to_value(&program).unwrap();
        assert!(value["declarations"][0].get("metadata").is_none());
        assert!(value["methods"][0].get("metadata").is_none());
        assert!(value["methods"][0]["args"][0].get("metadata").is_none());
        assert!(value["actor"]["initArgs"][0].get("metadata").is_none());
        assert!(value["types"][1]["kind"]["fields"][0]
            .get("metadata")
            .is_none());

        let round_trip: ProgramIr = serde_json::from_value(value).unwrap();
        assert_eq!(round_trip, program);
    }

    #[test]
    fn non_empty_metadata_is_serialized() {
        let metadata = MetadataIr {
            docs: vec!["Documented.".to_string()],
            raw_docs: vec!["Documented.".to_string(), "@strict".to_string()],
            doc_tags: vec![DocTag {
                name: "strict".to_string(),
                value: "".to_string(),
            }],
        };

        assert!(!metadata.is_empty());
        assert_eq!(
            serde_json::to_value(metadata).unwrap(),
            serde_json::json!({
                "docs": ["Documented."],
                "rawDocs": ["Documented.", "@strict"],
                "docTags": [{ "name": "strict", "value": "" }],
            })
        );
    }

    #[test]
    fn graph_resolves_type_and_declaration_references() {
        let program = ProgramIr {
            version: PROGRAM_IR_VERSION,
            types: vec![TypeNodeIr {
                kind: TypeKindIr::Nat64,
            }],
            declarations: vec![
                TypeDeclIr {
                    name: "UserId".to_string(),
                    typ: TypeId(0),
                    metadata: MetadataIr::default(),
                },
                TypeDeclIr {
                    name: "TransactionId".to_string(),
                    typ: TypeId(0),
                    metadata: MetadataIr::default(),
                },
            ],
            methods: vec![],
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
                .resolve_ref(TypeRefIr::Decl { id: DeclId(1) })
                .unwrap(),
            TypeId(0)
        );
        assert_eq!(graph.declaration(DeclId(0)).unwrap().name, "UserId");
        assert_eq!(graph.declaration(DeclId(1)).unwrap().name, "TransactionId");
        assert_eq!(graph.declaration_id_by_name("UserId"), Some(DeclId(0)));
        assert_eq!(
            graph.declaration_id_by_name("TransactionId"),
            Some(DeclId(1))
        );
        assert_eq!(
            graph.declaration_by_name("TransactionId").unwrap().typ,
            TypeId(0)
        );
    }

    #[test]
    fn graph_returns_validated_actor_service_methods() {
        let program = ProgramIr {
            version: PROGRAM_IR_VERSION,
            types: vec![TypeNodeIr {
                kind: TypeKindIr::Service {
                    methods: vec![MethodId(0)],
                },
            }],
            methods: vec![method("ping")],
            declarations: vec![],
            actor: Some(ActorIr {
                init_args: vec![],
                service: TypeId(0),
            }),
        };

        let graph = program.graph().unwrap();
        let methods = graph.actor_service_methods().unwrap();

        assert_eq!(methods.len(), 1);
        assert_eq!(methods[0].name, "ping");
        assert_eq!(graph.method(MethodId(0)).unwrap().name, "ping");
        assert_eq!(graph.actor_service_method_ids().unwrap(), &[MethodId(0)]);
    }

    #[test]
    fn graph_validation_rejects_missing_type_ids() {
        let program = ProgramIr {
            version: PROGRAM_IR_VERSION,
            types: vec![],
            declarations: vec![TypeDeclIr {
                name: "Missing".to_string(),
                typ: TypeId(7),
                metadata: MetadataIr::default(),
            }],
            methods: vec![],
            actor: None,
        };

        assert_eq!(
            program.validate().unwrap_err(),
            ProgramIrError::MissingType { id: TypeId(7) }
        );
    }

    #[test]
    fn graph_validation_rejects_missing_declaration_ids() {
        let program = ProgramIr {
            version: PROGRAM_IR_VERSION,
            types: vec![TypeNodeIr {
                kind: TypeKindIr::Vec {
                    inner: TypeRefIr::Decl { id: DeclId(7) },
                },
            }],
            declarations: vec![],
            methods: vec![],
            actor: None,
        };

        assert_eq!(
            program.validate().unwrap_err(),
            ProgramIrError::MissingDeclaration { id: DeclId(7) }
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
                    name: "Name".to_string(),
                    typ: TypeId(0),
                    metadata: MetadataIr::default(),
                },
                TypeDeclIr {
                    name: "Name".to_string(),
                    typ: TypeId(0),
                    metadata: MetadataIr::default(),
                },
            ],
            methods: vec![],
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
            methods: vec![],
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
    fn graph_validation_rejects_missing_method_ids() {
        let program = ProgramIr {
            version: PROGRAM_IR_VERSION,
            types: vec![TypeNodeIr {
                kind: TypeKindIr::Service {
                    methods: vec![MethodId(7)],
                },
            }],
            declarations: vec![],
            methods: vec![],
            actor: None,
        };

        assert_eq!(
            program.validate().unwrap_err(),
            ProgramIrError::MissingMethod { id: MethodId(7) }
        );
    }

    #[test]
    fn graph_validation_rejects_oneway_method_returns() {
        let program = ProgramIr {
            version: PROGRAM_IR_VERSION,
            types: vec![
                TypeNodeIr {
                    kind: TypeKindIr::Service {
                        methods: vec![MethodId(0)],
                    },
                },
                TypeNodeIr {
                    kind: TypeKindIr::Text,
                },
            ],
            declarations: vec![],
            methods: vec![MethodIr {
                name: "notify".to_string(),
                mode: MethodModeIr::Oneway,
                args: vec![],
                returns: vec![arg(TypeRefIr::Type { id: TypeId(1) })],
                metadata: MetadataIr::default(),
            }],
            actor: None,
        };

        assert_eq!(
            program.validate().unwrap_err(),
            ProgramIrError::OnewayMethodHasReturns {
                id: MethodId(0),
                returns: 1,
            }
        );
    }

    #[test]
    fn graph_validation_rejects_oneway_func_type_returns() {
        let program = ProgramIr {
            version: PROGRAM_IR_VERSION,
            types: vec![
                TypeNodeIr {
                    kind: TypeKindIr::Func {
                        args: vec![],
                        returns: vec![arg(TypeRefIr::Type { id: TypeId(1) })],
                        mode: MethodModeIr::Oneway,
                    },
                },
                TypeNodeIr {
                    kind: TypeKindIr::Text,
                },
            ],
            declarations: vec![],
            methods: vec![],
            actor: None,
        };

        assert_eq!(
            program.validate().unwrap_err(),
            ProgramIrError::OnewayFuncTypeHasReturns {
                id: TypeId(0),
                returns: 1,
            }
        );
    }

    #[test]
    fn graph_validation_rejects_direct_structural_type_cycles() {
        let program = ProgramIr {
            version: PROGRAM_IR_VERSION,
            types: vec![TypeNodeIr {
                kind: TypeKindIr::Opt {
                    inner: TypeRefIr::Type { id: TypeId(0) },
                },
            }],
            declarations: vec![],
            methods: vec![],
            actor: None,
        };

        assert_eq!(
            program.validate().unwrap_err(),
            ProgramIrError::DirectTypeCycle { id: TypeId(0) }
        );
    }

    #[test]
    fn graph_validation_rejects_service_method_direct_structural_type_cycles() {
        let program = ProgramIr {
            version: PROGRAM_IR_VERSION,
            types: vec![TypeNodeIr {
                kind: TypeKindIr::Service {
                    methods: vec![MethodId(0)],
                },
            }],
            declarations: vec![],
            methods: vec![MethodIr {
                name: "self_ref".to_string(),
                mode: MethodModeIr::Query,
                args: vec![arg(TypeRefIr::Type { id: TypeId(0) })],
                returns: vec![],
                metadata: MetadataIr::default(),
            }],
            actor: None,
        };

        assert_eq!(
            program.validate().unwrap_err(),
            ProgramIrError::DirectTypeCycle { id: TypeId(0) }
        );
    }

    #[test]
    fn graph_validation_allows_recursion_through_declaration_refs() {
        let program = ProgramIr {
            version: PROGRAM_IR_VERSION,
            types: vec![TypeNodeIr {
                kind: TypeKindIr::Opt {
                    inner: TypeRefIr::Decl { id: DeclId(0) },
                },
            }],
            declarations: vec![TypeDeclIr {
                name: "Loop".to_string(),
                typ: TypeId(0),
                metadata: MetadataIr::default(),
            }],
            methods: vec![],
            actor: None,
        };

        program.validate().unwrap();
    }

    #[test]
    fn graph_validation_rejects_duplicate_method_references() {
        let program = ProgramIr {
            version: PROGRAM_IR_VERSION,
            types: vec![
                TypeNodeIr {
                    kind: TypeKindIr::Service {
                        methods: vec![MethodId(0)],
                    },
                },
                TypeNodeIr {
                    kind: TypeKindIr::Service {
                        methods: vec![MethodId(0)],
                    },
                },
            ],
            declarations: vec![],
            methods: vec![method("shared")],
            actor: None,
        };

        assert_eq!(
            program.validate().unwrap_err(),
            ProgramIrError::DuplicateMethodReference { id: MethodId(0) }
        );
    }

    #[test]
    fn graph_validation_rejects_unreferenced_methods() {
        let program = ProgramIr {
            version: PROGRAM_IR_VERSION,
            types: vec![TypeNodeIr {
                kind: TypeKindIr::Service { methods: vec![] },
            }],
            declarations: vec![],
            methods: vec![method("orphan")],
            actor: None,
        };

        assert_eq!(
            program.validate().unwrap_err(),
            ProgramIrError::UnreferencedMethod { id: MethodId(0) }
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
                            named_field("a", TypeRefIr::Type { id: TypeId(1) }),
                            id_field(97, TypeRefIr::Type { id: TypeId(1) }),
                        ],
                    },
                },
                TypeNodeIr {
                    kind: TypeKindIr::Text,
                },
            ],
            declarations: vec![],
            methods: vec![],
            actor: None,
        };

        assert_eq!(
            program.validate().unwrap_err(),
            ProgramIrError::DuplicateFieldId {
                type_id: TypeId(0),
                candid_id: 97,
            }
        );
    }

    #[test]
    fn semantic_analysis_detects_semantics_without_replacing_wire_kinds() {
        let program = ProgramIr {
            version: PROGRAM_IR_VERSION,
            types: vec![
                TypeNodeIr {
                    kind: TypeKindIr::Nat8,
                },
                TypeNodeIr {
                    kind: TypeKindIr::Vec {
                        inner: TypeRefIr::Type { id: TypeId(0) },
                    },
                },
                TypeNodeIr {
                    kind: TypeKindIr::Text,
                },
                TypeNodeIr {
                    kind: TypeKindIr::Nat64,
                },
                TypeNodeIr {
                    kind: TypeKindIr::Record {
                        fields: vec![
                            unnamed_field(0, TypeRefIr::Type { id: TypeId(2) }),
                            unnamed_field(1, TypeRefIr::Type { id: TypeId(3) }),
                        ],
                    },
                },
                TypeNodeIr {
                    kind: TypeKindIr::Variant {
                        fields: vec![
                            named_field("Ok", TypeRefIr::Type { id: TypeId(3) }),
                            named_field("Err", TypeRefIr::Type { id: TypeId(2) }),
                        ],
                    },
                },
            ],
            declarations: vec![],
            methods: vec![],
            actor: None,
        };

        let semantics = program.semantics().unwrap();

        assert_eq!(
            semantics.semantic(TypeId(1)).unwrap(),
            Some(&TypeSemanticIr::Blob)
        );
        assert_eq!(
            semantics.semantic(TypeId(4)).unwrap(),
            Some(&TypeSemanticIr::Tuple)
        );
        assert_eq!(
            semantics.semantic(TypeId(5)).unwrap(),
            Some(&TypeSemanticIr::Result {
                ok_field: candid_label_id("Ok"),
                err_field: candid_label_id("Err"),
            })
        );

        let graph = program.graph().unwrap();
        assert!(matches!(
            graph.type_kind(TypeId(1)).unwrap(),
            TypeKindIr::Vec { .. }
        ));
        assert!(matches!(
            graph.type_kind(TypeId(4)).unwrap(),
            TypeKindIr::Record { .. }
        ));
        assert!(matches!(
            graph.type_kind(TypeId(5)).unwrap(),
            TypeKindIr::Variant { .. }
        ));
    }

    #[test]
    fn semantic_analysis_resolves_decl_refs_and_rejects_empty_tuple_records() {
        let program = ProgramIr {
            version: PROGRAM_IR_VERSION,
            types: vec![
                TypeNodeIr {
                    kind: TypeKindIr::Nat8,
                },
                TypeNodeIr {
                    kind: TypeKindIr::Vec {
                        inner: TypeRefIr::Decl { id: DeclId(0) },
                    },
                },
                TypeNodeIr {
                    kind: TypeKindIr::Record { fields: vec![] },
                },
            ],
            declarations: vec![TypeDeclIr {
                name: "Byte".to_string(),
                typ: TypeId(0),
                metadata: MetadataIr::default(),
            }],
            methods: vec![],
            actor: None,
        };

        let semantics = program.semantics().unwrap();

        assert_eq!(
            semantics.semantic(TypeId(1)).unwrap(),
            Some(&TypeSemanticIr::Blob)
        );
        assert_eq!(semantics.semantic(TypeId(2)).unwrap(), None);
    }

    fn method(name: &str) -> MethodIr {
        MethodIr {
            name: name.to_string(),
            mode: MethodModeIr::Query,
            args: vec![],
            returns: vec![],
            metadata: MetadataIr::default(),
        }
    }

    fn arg(typ: TypeRefIr) -> ArgIr {
        ArgIr {
            name: None,
            typ,
            metadata: MetadataIr::default(),
        }
    }

    fn named_field(name: &str, typ: TypeRefIr) -> FieldIr {
        FieldIr {
            label: FieldLabelIr::Named {
                name: name.to_string(),
            },
            typ,
            metadata: MetadataIr::default(),
        }
    }

    fn unnamed_field(candid_id: u32, typ: TypeRefIr) -> FieldIr {
        FieldIr {
            label: FieldLabelIr::Unnamed { candid_id },
            typ,
            metadata: MetadataIr::default(),
        }
    }

    fn id_field(candid_id: u32, typ: TypeRefIr) -> FieldIr {
        FieldIr {
            label: FieldLabelIr::Id { candid_id },
            typ,
            metadata: MetadataIr::default(),
        }
    }
}
