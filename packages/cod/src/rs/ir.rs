//! Canonical language-neutral program IR for `cod`.
//!
//! # Architecture contract
//!
//! After Candid parsing and type checking, `ProgramIr` is the single structural
//! source of truth for the rest of the project.
//!
//! Only the Candid frontend/lowering layer may inspect `TypeEnv`, `Type`,
//! `TypeInner`, `IDLType`, or `IDLMergedProg` to discover program structure.
//! Runtime schemas, forms, workflows, devtools, framework tooling, and emitters
//! must consume `ProgramIr` instead of independently reinterpreting Candid.
//!
//! Candid Rust types may remain private to the codec for typed wire encoding and
//! decoding. The codec is an implementation detail, not a second structural model.
//!
//! The canonical IR must remain versioned, serializable, and language-neutral.
//! Never add TypeScript-, React-, TanStack-, form-widget-, or framework-specific
//! fields here. Wire truth and semantic conveniences such as blob, tuple, and
//! Result recognition must remain conceptually separate.
//!
//! Generated code is emitter output, never a source of truth. The TypeScript
//! emitter must ultimately consume only `ProgramIr` and must not walk the Candid
//! parser/type environment directly.

use std::collections::BTreeMap;

use anyhow::{anyhow, Context, Result};
use candid_parser::candid::types::{FuncMode, Label, SharedLabel, Type, TypeEnv, TypeInner};
use candid_parser::syntax::{Binding, IDLArgType, IDLMergedProg, IDLType, PrimType, TypeField};
use serde::{Deserialize, Serialize};

use crate::docs::{DocBlock, DocTag};

pub const PROGRAM_IR_VERSION: u16 = 1;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(transparent)]
pub struct TypeId(pub u32);

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(transparent)]
pub struct DeclId(pub u32);

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
    Opt { inner: TypeRefIr },
    Vec { inner: TypeRefIr },
    Record { fields: Vec<FieldIr> },
    Variant { fields: Vec<FieldIr> },
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
enum PrimitiveKindIr {
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
}

impl From<PrimitiveKindIr> for TypeKindIr {
    fn from(kind: PrimitiveKindIr) -> Self {
        match kind {
            PrimitiveKindIr::Null => Self::Null,
            PrimitiveKindIr::Bool => Self::Bool,
            PrimitiveKindIr::Text => Self::Text,
            PrimitiveKindIr::Nat => Self::Nat,
            PrimitiveKindIr::Int => Self::Int,
            PrimitiveKindIr::Nat8 => Self::Nat8,
            PrimitiveKindIr::Nat16 => Self::Nat16,
            PrimitiveKindIr::Nat32 => Self::Nat32,
            PrimitiveKindIr::Nat64 => Self::Nat64,
            PrimitiveKindIr::Int8 => Self::Int8,
            PrimitiveKindIr::Int16 => Self::Int16,
            PrimitiveKindIr::Int32 => Self::Int32,
            PrimitiveKindIr::Int64 => Self::Int64,
            PrimitiveKindIr::Float32 => Self::Float32,
            PrimitiveKindIr::Float64 => Self::Float64,
            PrimitiveKindIr::Principal => Self::Principal,
            PrimitiveKindIr::Reserved => Self::Reserved,
            PrimitiveKindIr::Empty => Self::Empty,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ReservedTypeDeclIr {
    id: DeclId,
    name: String,
}

struct ArenaLoweringContext<'a> {
    _env: &'a TypeEnv,
    prog: &'a IDLMergedProg,
    types: Vec<TypeNodeIr>,
    declarations: Vec<ReservedTypeDeclIr>,
    declarations_by_name: BTreeMap<String, DeclId>,
    primitive_types: BTreeMap<PrimitiveKindIr, TypeId>,
}

impl<'a> ArenaLoweringContext<'a> {
    fn new(env: &'a TypeEnv, prog: &'a IDLMergedProg) -> Self {
        Self {
            _env: env,
            prog,
            types: Vec::new(),
            declarations: Vec::new(),
            declarations_by_name: BTreeMap::new(),
            primitive_types: BTreeMap::new(),
        }
    }

    fn reserve_declarations(&mut self) -> Result<()> {
        for binding in self.prog.bindings() {
            let index = u32::try_from(self.declarations.len())
                .context("ProgramIR declaration table exceeds u32")?;
            let id = DeclId(index);
            let previous = self.declarations_by_name.insert(binding.id.clone(), id);
            if previous.is_some() {
                return Err(anyhow!("duplicate Candid declaration `{}`", binding.id));
            }
            self.declarations.push(ReservedTypeDeclIr {
                id,
                name: binding.id.clone(),
            });
        }

        Ok(())
    }

    #[allow(dead_code)]
    fn declarations(&self) -> &[ReservedTypeDeclIr] {
        &self.declarations
    }

    #[allow(dead_code)]
    fn types(&self) -> &[TypeNodeIr] {
        &self.types
    }

    #[allow(dead_code)]
    fn type_node(&self, id: TypeId) -> Option<&TypeNodeIr> {
        self.types.get(usize::try_from(id.0).ok()?)
    }

    #[allow(dead_code)]
    fn declaration_id(&self, name: &str) -> Option<DeclId> {
        self.declarations_by_name.get(name).copied()
    }

    #[allow(dead_code)]
    fn type_ref_from_syntax(&self, syntax: &IDLType, structural_id: TypeId) -> Result<TypeRefIr> {
        match syntax {
            IDLType::VarT(name) => self
                .declaration_id(name)
                .map(|id| TypeRefIr::Decl { id })
                .with_context(|| format!("unreserved Candid declaration `{name}`")),
            _ => Ok(TypeRefIr::Type { id: structural_id }),
        }
    }

    #[allow(dead_code)]
    fn lower_type_ref(&mut self, syntax: &IDLType) -> Result<TypeRefIr> {
        match syntax {
            IDLType::VarT(name) => self
                .declaration_id(name)
                .map(|id| TypeRefIr::Decl { id })
                .with_context(|| format!("unreserved Candid declaration `{name}`")),
            _ => self.lower_type(syntax).map(|id| TypeRefIr::Type { id }),
        }
    }

    #[allow(dead_code)]
    fn lower_type(&mut self, syntax: &IDLType) -> Result<TypeId> {
        match syntax {
            IDLType::PrimT(kind) => self.lower_primitive_type(primitive_kind(kind)),
            IDLType::PrincipalT => self.lower_primitive_type(PrimitiveKindIr::Principal),
            IDLType::OptT(inner) => {
                let inner = self.lower_type_ref(inner)?;
                self.alloc_type(TypeKindIr::Opt { inner })
            }
            IDLType::VecT(inner) => {
                let inner = self.lower_type_ref(inner)?;
                self.alloc_type(TypeKindIr::Vec { inner })
            }
            IDLType::RecordT(fields) => {
                let fields = self.lower_fields(fields)?;
                self.alloc_type(TypeKindIr::Record { fields })
            }
            IDLType::VariantT(fields) => {
                let fields = self.lower_fields(fields)?;
                self.alloc_type(TypeKindIr::Variant { fields })
            }
            IDLType::VarT(name) => Err(anyhow!(
                "expected structural type syntax, got declaration reference `{name}`"
            )),
            IDLType::FuncT(_) | IDLType::ServT(_) | IDLType::ClassT(_, _) => Err(anyhow!(
                "function, service, and service class arena lowering is not implemented yet"
            )),
        }
    }

    fn lower_primitive_type(&mut self, kind: PrimitiveKindIr) -> Result<TypeId> {
        if let Some(id) = self.primitive_types.get(&kind) {
            return Ok(*id);
        }

        let id = self.alloc_type(TypeKindIr::from(kind))?;
        self.primitive_types.insert(kind, id);
        Ok(id)
    }

    fn lower_fields(&mut self, fields: &[TypeField]) -> Result<Vec<FieldIr>> {
        fields
            .iter()
            .map(|field| {
                let typ = self.lower_type_ref(&field.typ)?;
                let docs = doc_meta(&field.docs);
                Ok(FieldIr {
                    label: field_label_ir_from_label(&field.label),
                    typ,
                    metadata: MetadataIr {
                        docs: docs.docs,
                        raw_docs: docs.raw_docs,
                        doc_tags: docs.tags,
                    },
                })
            })
            .collect()
    }

    fn alloc_type(&mut self, kind: TypeKindIr) -> Result<TypeId> {
        let index = u32::try_from(self.types.len()).context("ProgramIR type arena exceeds u32")?;
        let id = TypeId(index);
        self.types.push(TypeNodeIr { kind });
        Ok(id)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProgramIr {
    pub version: u16,
    pub types: Vec<CandidTypeDeclIr>,
    pub actor: Option<CandidActorIr>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CandidActorIr {
    pub init_args: Vec<CandidArgIr>,
    pub service: CandidServiceIr,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CandidTypeDeclIr {
    pub name: String,
    #[serde(rename = "type")]
    pub typ: CandidTypeIr,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub docs: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub raw_docs: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub doc_tags: Vec<DocTag>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CandidServiceIr {
    pub methods: Vec<CandidMethodIr>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CandidMethodModeIr {
    Query,
    CompositeQuery,
    Update,
    Oneway,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CandidMethodIr {
    pub name: String,
    pub mode: CandidMethodModeIr,
    pub args: Vec<CandidArgIr>,
    pub returns: Vec<CandidArgIr>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub docs: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub raw_docs: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub doc_tags: Vec<DocTag>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CandidArgIr {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(rename = "type")]
    pub typ: CandidTypeIr,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub docs: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub raw_docs: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub doc_tags: Vec<DocTag>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CandidTypeIr {
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
    Blob,
    Reserved,
    Empty,
    Opt {
        inner: Box<CandidTypeIr>,
    },
    Vec {
        inner: Box<CandidTypeIr>,
    },
    Record {
        fields: Vec<CandidFieldIr>,
    },
    Variant {
        fields: Vec<CandidFieldIr>,
    },
    Ref {
        name: String,
    },
    Func {
        args: Vec<CandidArgIr>,
        returns: Vec<CandidArgIr>,
        mode: CandidMethodModeIr,
    },
    Service {
        methods: Vec<CandidMethodIr>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CandidFieldIr {
    pub label: CandidFieldLabelIr,
    pub candid_id: u32,
    #[serde(rename = "type")]
    pub typ: CandidTypeIr,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub docs: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub raw_docs: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub doc_tags: Vec<DocTag>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CandidFieldLabelIr {
    Named { name: String },
    Id { id: u32 },
    Unnamed { id: u32 },
}

pub fn program_ir(env: &TypeEnv, actor: &Type, prog: &IDLMergedProg) -> Result<ProgramIr> {
    program_ir_from_parts(env, Some(actor), prog)
}

pub fn program_ir_from_parts(
    env: &TypeEnv,
    actor: Option<&Type>,
    prog: &IDLMergedProg,
) -> Result<ProgramIr> {
    let mut arena_lowerer = ArenaLoweringContext::new(env, prog);
    arena_lowerer.reserve_declarations()?;

    let types = env
        .to_sorted_iter()
        .map(|(name, ty)| {
            let syntax = prog.lookup(name);
            let doc = syntax
                .map(|binding| doc_meta(&binding.docs))
                .unwrap_or_default();
            Ok(CandidTypeDeclIr {
                name: name.to_string(),
                typ: type_ir(env, ty, syntax.map(|binding| &binding.typ))?,
                docs: doc.docs,
                raw_docs: doc.raw_docs,
                doc_tags: doc.tags,
            })
        })
        .collect::<Result<Vec<_>>>()?;

    let actor = actor.map(|actor| actor_ir(env, actor, prog)).transpose()?;

    Ok(ProgramIr {
        version: PROGRAM_IR_VERSION,
        types,
        actor,
    })
}

fn actor_ir(env: &TypeEnv, actor: &Type, prog: &IDLMergedProg) -> Result<CandidActorIr> {
    let (init_args, service) = match env.trace_type(actor)?.as_ref() {
        TypeInner::Class(args, service) => (args.clone(), service.clone()),
        TypeInner::Service(_) => (Vec::new(), actor.clone()),
        other => return Err(anyhow!("expected service or service class, got {other}")),
    };

    let syntax_actor = prog.resolve_actor().ok().flatten();
    let syntax_init_args = match syntax_actor.as_ref().map(|actor| &actor.typ) {
        Some(IDLType::ClassT(args, _)) => Some(args.as_slice()),
        _ => None,
    };

    let init_args = init_args
        .iter()
        .enumerate()
        .map(|(index, ty)| {
            let syntax_arg = syntax_init_args.and_then(|args| args.get(index));
            arg_ir(env, ty, syntax_arg)
        })
        .collect::<Result<Vec<_>>>()?;

    Ok(CandidActorIr {
        init_args,
        service: service_ir(env, &service, prog)?,
    })
}

fn service_ir(env: &TypeEnv, service: &Type, prog: &IDLMergedProg) -> Result<CandidServiceIr> {
    let methods = env.as_service(service)?;
    let syntax_methods = actor_service_syntax(prog);

    Ok(CandidServiceIr {
        methods: methods
            .iter()
            .map(|(name, ty)| {
                let syntax = syntax_methods
                    .as_deref()
                    .and_then(|methods| methods.iter().find(|binding| binding.id == *name));
                method_ir(env, name, ty, syntax)
            })
            .collect::<Result<Vec<_>>>()?,
    })
}

fn method_ir(
    env: &TypeEnv,
    name: &str,
    ty: &Type,
    syntax: Option<&Binding>,
) -> Result<CandidMethodIr> {
    let func = env
        .as_func(ty)
        .with_context(|| format!("method `{name}` is not a function"))?;
    let syntax_func = match syntax.map(|binding| &binding.typ) {
        Some(IDLType::FuncT(func)) => Some(func),
        _ => None,
    };
    let doc = syntax
        .map(|binding| doc_meta(&binding.docs))
        .unwrap_or_default();

    Ok(CandidMethodIr {
        name: name.to_string(),
        mode: mode(&func.modes),
        args: func
            .args
            .iter()
            .enumerate()
            .map(|(index, ty)| {
                let syntax_arg = syntax_func.and_then(|func| func.args.get(index));
                arg_ir(env, ty, syntax_arg)
            })
            .collect::<Result<Vec<_>>>()?,
        returns: func
            .rets
            .iter()
            .enumerate()
            .map(|(index, ty)| {
                let syntax_arg = syntax_func.and_then(|func| func.rets.get(index));
                arg_ir(env, ty, syntax_arg)
            })
            .collect::<Result<Vec<_>>>()?,
        docs: doc.docs,
        raw_docs: doc.raw_docs,
        doc_tags: doc.tags,
    })
}

fn arg_ir(env: &TypeEnv, ty: &Type, syntax: Option<&IDLArgType>) -> Result<CandidArgIr> {
    Ok(CandidArgIr {
        name: syntax.and_then(|arg| arg.name.clone()),
        typ: type_ir(env, ty, syntax.map(|arg| &arg.typ))?,
        docs: Vec::new(),
        raw_docs: Vec::new(),
        doc_tags: Vec::new(),
    })
}

fn type_ir(env: &TypeEnv, ty: &Type, syntax: Option<&IDLType>) -> Result<CandidTypeIr> {
    if ty.is_blob(env) {
        return Ok(CandidTypeIr::Blob);
    }

    Ok(match ty.as_ref() {
        TypeInner::Null => CandidTypeIr::Null,
        TypeInner::Bool => CandidTypeIr::Bool,
        TypeInner::Text => CandidTypeIr::Text,
        TypeInner::Nat => CandidTypeIr::Nat,
        TypeInner::Int => CandidTypeIr::Int,
        TypeInner::Nat8 => CandidTypeIr::Nat8,
        TypeInner::Nat16 => CandidTypeIr::Nat16,
        TypeInner::Nat32 => CandidTypeIr::Nat32,
        TypeInner::Nat64 => CandidTypeIr::Nat64,
        TypeInner::Int8 => CandidTypeIr::Int8,
        TypeInner::Int16 => CandidTypeIr::Int16,
        TypeInner::Int32 => CandidTypeIr::Int32,
        TypeInner::Int64 => CandidTypeIr::Int64,
        TypeInner::Float32 => CandidTypeIr::Float32,
        TypeInner::Float64 => CandidTypeIr::Float64,
        TypeInner::Principal => CandidTypeIr::Principal,
        TypeInner::Reserved | TypeInner::Unknown | TypeInner::Future => CandidTypeIr::Reserved,
        TypeInner::Empty => CandidTypeIr::Empty,
        TypeInner::Var(name) => CandidTypeIr::Ref { name: name.clone() },
        TypeInner::Knot(id) => CandidTypeIr::Ref {
            name: id.to_string(),
        },
        TypeInner::Opt(inner) => CandidTypeIr::Opt {
            inner: Box::new(type_ir(env, inner, opt_syntax(syntax))?),
        },
        TypeInner::Vec(inner) => CandidTypeIr::Vec {
            inner: Box::new(type_ir(env, inner, vec_syntax(syntax))?),
        },
        TypeInner::Record(fields) => CandidTypeIr::Record {
            fields: fields_ir(env, fields, record_syntax_fields(syntax))?,
        },
        TypeInner::Variant(fields) => CandidTypeIr::Variant {
            fields: fields_ir(env, fields, record_syntax_fields(syntax))?,
        },
        TypeInner::Func(func) => {
            let syntax_func = match syntax {
                Some(IDLType::FuncT(func)) => Some(func),
                _ => None,
            };
            CandidTypeIr::Func {
                args: func
                    .args
                    .iter()
                    .enumerate()
                    .map(|(index, ty)| {
                        let syntax_arg = syntax_func.and_then(|func| func.args.get(index));
                        arg_ir(env, ty, syntax_arg)
                    })
                    .collect::<Result<Vec<_>>>()?,
                returns: func
                    .rets
                    .iter()
                    .enumerate()
                    .map(|(index, ty)| {
                        let syntax_arg = syntax_func.and_then(|func| func.rets.get(index));
                        arg_ir(env, ty, syntax_arg)
                    })
                    .collect::<Result<Vec<_>>>()?,
                mode: mode(&func.modes),
            }
        }
        TypeInner::Service(methods) => CandidTypeIr::Service {
            methods: methods
                .iter()
                .map(|(name, ty)| method_ir(env, name, ty, None))
                .collect::<Result<Vec<_>>>()?,
        },
        TypeInner::Class(_, inner) => type_ir(env, inner, class_inner_syntax(syntax))?,
    })
}

fn fields_ir(
    env: &TypeEnv,
    fields: &[candid_parser::candid::types::Field],
    syntax_fields: Option<&[candid_parser::syntax::TypeField]>,
) -> Result<Vec<CandidFieldIr>> {
    fields
        .iter()
        .enumerate()
        .map(|(index, field)| {
            let syntax_field = find_syntax_field(syntax_fields, &field.id).or_else(|| {
                syntax_fields
                    .and_then(|fields| fields.get(index))
                    .filter(|field| matches!(field.label, Label::Unnamed(_)))
            });
            let doc = syntax_field
                .map(|field| doc_meta(&field.docs))
                .unwrap_or_default();
            let label = syntax_field
                .map(|field| field_label_from_label(&field.label))
                .unwrap_or_else(|| field_label(&field.id));
            Ok(CandidFieldIr {
                label,
                candid_id: field.id.get_id(),
                typ: type_ir(env, &field.ty, syntax_field.map(|field| &field.typ))?,
                docs: doc.docs,
                raw_docs: doc.raw_docs,
                doc_tags: doc.tags,
            })
        })
        .collect()
}

fn mode(modes: &[FuncMode]) -> CandidMethodModeIr {
    if modes.iter().any(|mode| matches!(mode, FuncMode::Oneway)) {
        CandidMethodModeIr::Oneway
    } else if modes
        .iter()
        .any(|mode| matches!(mode, FuncMode::CompositeQuery))
    {
        CandidMethodModeIr::CompositeQuery
    } else if modes.iter().any(|mode| matches!(mode, FuncMode::Query)) {
        CandidMethodModeIr::Query
    } else {
        CandidMethodModeIr::Update
    }
}

#[derive(Debug, Clone, Default)]
struct DocMeta {
    docs: Vec<String>,
    raw_docs: Vec<String>,
    tags: Vec<DocTag>,
}

fn doc_meta(lines: &[String]) -> DocMeta {
    let block = DocBlock::parse(lines);
    if block.is_empty() {
        DocMeta::default()
    } else {
        DocMeta {
            docs: block
                .lines
                .iter()
                .filter(|line| !line.trim_start().starts_with('@'))
                .cloned()
                .collect(),
            raw_docs: block.lines,
            tags: block.tags,
        }
    }
}

fn field_label(label: &SharedLabel) -> CandidFieldLabelIr {
    match label.as_ref() {
        Label::Named(name) => CandidFieldLabelIr::Named { name: name.clone() },
        Label::Id(id) => CandidFieldLabelIr::Id { id: *id },
        Label::Unnamed(id) => CandidFieldLabelIr::Unnamed { id: *id },
    }
}

fn actor_service_syntax(prog: &IDLMergedProg) -> Option<Vec<Binding>> {
    match prog.resolve_actor().ok().flatten()?.typ {
        IDLType::ServT(methods) => Some(methods),
        IDLType::ClassT(_, inner) => match *inner {
            IDLType::ServT(methods) => Some(methods),
            _ => None,
        },
        _ => None,
    }
}

fn opt_syntax(syntax: Option<&IDLType>) -> Option<&IDLType> {
    match syntax {
        Some(IDLType::OptT(inner)) => Some(inner),
        _ => None,
    }
}

fn vec_syntax(syntax: Option<&IDLType>) -> Option<&IDLType> {
    match syntax {
        Some(IDLType::VecT(inner)) => Some(inner),
        _ => None,
    }
}

fn record_syntax_fields(syntax: Option<&IDLType>) -> Option<&[candid_parser::syntax::TypeField]> {
    match syntax {
        Some(IDLType::RecordT(fields)) | Some(IDLType::VariantT(fields)) => Some(fields),
        _ => None,
    }
}

fn find_syntax_field<'a>(
    fields: Option<&'a [candid_parser::syntax::TypeField]>,
    label: &SharedLabel,
) -> Option<&'a candid_parser::syntax::TypeField> {
    let id = label.get_id();
    fields?.iter().find(|field| field.label.get_id() == id)
}

fn field_label_from_label(label: &Label) -> CandidFieldLabelIr {
    match label {
        Label::Named(name) => CandidFieldLabelIr::Named { name: name.clone() },
        Label::Id(id) => CandidFieldLabelIr::Id { id: *id },
        Label::Unnamed(id) => CandidFieldLabelIr::Unnamed { id: *id },
    }
}

fn primitive_kind(kind: &PrimType) -> PrimitiveKindIr {
    match kind {
        PrimType::Null => PrimitiveKindIr::Null,
        PrimType::Bool => PrimitiveKindIr::Bool,
        PrimType::Text => PrimitiveKindIr::Text,
        PrimType::Nat => PrimitiveKindIr::Nat,
        PrimType::Int => PrimitiveKindIr::Int,
        PrimType::Nat8 => PrimitiveKindIr::Nat8,
        PrimType::Nat16 => PrimitiveKindIr::Nat16,
        PrimType::Nat32 => PrimitiveKindIr::Nat32,
        PrimType::Nat64 => PrimitiveKindIr::Nat64,
        PrimType::Int8 => PrimitiveKindIr::Int8,
        PrimType::Int16 => PrimitiveKindIr::Int16,
        PrimType::Int32 => PrimitiveKindIr::Int32,
        PrimType::Int64 => PrimitiveKindIr::Int64,
        PrimType::Float32 => PrimitiveKindIr::Float32,
        PrimType::Float64 => PrimitiveKindIr::Float64,
        PrimType::Reserved => PrimitiveKindIr::Reserved,
        PrimType::Empty => PrimitiveKindIr::Empty,
    }
}

fn field_label_ir_from_label(label: &Label) -> FieldLabelIr {
    let candid_id = label.get_id();
    match label {
        Label::Named(name) => FieldLabelIr::Named {
            name: name.clone(),
            candid_id,
        },
        Label::Id(_) => FieldLabelIr::Id { candid_id },
        Label::Unnamed(_) => FieldLabelIr::Unnamed { candid_id },
    }
}

fn class_inner_syntax(syntax: Option<&IDLType>) -> Option<&IDLType> {
    match syntax {
        Some(IDLType::ClassT(_, inner)) => Some(inner),
        _ => syntax,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse_candid_source;

    #[test]
    fn emits_named_refs_and_docs() {
        let parsed = parse_candid_source(
            r#"
// Account docs.
type Account = record {
  // Owner docs.
  owner : principal;
  subaccount : opt blob;
};

service : {
  // Balance docs.
  icrc1_balance_of : (Account) -> (nat) query;
}
"#,
        )
        .unwrap();
        let actor = parsed.actor.as_ref().unwrap();
        let ir = program_ir(&parsed.env, actor, &parsed.prog).unwrap();

        assert_eq!(ir.types[0].name, "Account");
        assert_eq!(ir.types[0].docs, vec!["Account docs."]);
        let actor = ir.actor.as_ref().unwrap();
        assert_eq!(actor.service.methods[0].mode, CandidMethodModeIr::Query);
        assert_eq!(actor.service.methods[0].docs, vec!["Balance docs."]);
        assert!(matches!(
            actor.service.methods[0].args[0].typ,
            CandidTypeIr::Ref { .. }
        ));
    }

    #[test]
    fn emits_doc_tags_for_declarations_methods_and_fields() {
        let parsed = parse_candid_source(
            r#"
/// Contact docs.
/// @strict
type Contact = record {
  // Email docs.
  // @format email Invalid email
  email : text;

  /// Phone docs.
  /// @format phone-number Must be valid
  phone : text;
};

service : {
  // Save docs.
  // @minimum 1 Method metadata survives too
  save : (Contact) -> ();
}
"#,
        )
        .unwrap();
        let actor = parsed.actor.as_ref().unwrap();
        let ir = program_ir(&parsed.env, actor, &parsed.prog).unwrap();
        println!("{}", serde_json::to_string_pretty(&ir).unwrap());

        let contact = ir.types.iter().find(|decl| decl.name == "Contact").unwrap();
        assert_eq!(contact.docs, vec!["Contact docs."]);
        assert_eq!(contact.raw_docs, vec!["Contact docs.", "@strict"]);
        assert_eq!(contact.doc_tags[0].name, "strict");
        assert_eq!(contact.doc_tags[0].value, "");

        let CandidTypeIr::Record { fields } = &contact.typ else {
            panic!("expected Contact record");
        };
        let email = fields.iter().find(|field| named(field, "email")).unwrap();
        assert_eq!(email.docs, vec!["Email docs."]);
        assert_eq!(
            email.raw_docs,
            vec!["Email docs.", "@format email Invalid email"]
        );
        assert_eq!(email.doc_tags[0].name, "format");
        assert_eq!(email.doc_tags[0].value, "email Invalid email");

        let phone = fields.iter().find(|field| named(field, "phone")).unwrap();
        assert_eq!(phone.docs, vec!["Phone docs."]);
        assert_eq!(phone.doc_tags[0].name, "format");
        assert_eq!(phone.doc_tags[0].value, "phone-number Must be valid");

        let method = &ir.actor.as_ref().unwrap().service.methods[0];
        assert_eq!(method.docs, vec!["Save docs."]);
        assert_eq!(method.doc_tags[0].name, "minimum");
        assert_eq!(method.doc_tags[0].value, "1 Method metadata survives too");
    }

    #[test]
    fn preserves_program_version_and_actor_init_args() {
        let parsed = parse_candid_source(
            r#"
service : (text, opt principal) -> {
  greet : (text) -> (text) query;
}
"#,
        )
        .unwrap();
        let actor = parsed.actor.as_ref().unwrap();
        let ir = program_ir(&parsed.env, actor, &parsed.prog).unwrap();

        assert_eq!(ir.version, PROGRAM_IR_VERSION);
        let actor = ir.actor.as_ref().unwrap();
        assert_eq!(actor.init_args.len(), 2);
        assert_eq!(actor.service.methods.len(), 1);
        assert_eq!(actor.service.methods[0].mode, CandidMethodModeIr::Query);
    }

    #[test]
    fn preserves_absent_actor_as_none() {
        let parsed = parse_candid_source(
            r#"
type User = record {
  name : text;
};
"#,
        )
        .unwrap();
        let ir = program_ir_from_parts(&parsed.env, parsed.actor.as_ref(), &parsed.prog).unwrap();

        assert!(parsed.actor.is_none());
        assert!(ir.actor.is_none());
        assert!(ir.types.iter().any(|decl| decl.name == "User"));
        let json = serde_json::to_value(&ir).unwrap();
        assert!(json.get("actor").unwrap().is_null());
    }

    #[test]
    fn preserves_empty_actor_as_present_actor() {
        let parsed = parse_candid_source("service : {}").unwrap();
        let ir = program_ir_from_parts(&parsed.env, parsed.actor.as_ref(), &parsed.prog).unwrap();

        let actor = ir.actor.as_ref().expect("empty service is still an actor");
        assert!(actor.init_args.is_empty());
        assert!(actor.service.methods.is_empty());
    }

    #[test]
    fn preserves_all_method_modes() {
        let parsed = parse_candid_source(
            r#"
service : {
  read : () -> (text) query;
  stream : () -> (text) composite_query;
  write : (text) -> ();
  notify : (text) -> () oneway;
}
"#,
        )
        .unwrap();
        let actor = parsed.actor.as_ref().unwrap();
        let ir = program_ir(&parsed.env, actor, &parsed.prog).unwrap();

        assert_eq!(method_mode(&ir, "read"), CandidMethodModeIr::Query);
        assert_eq!(
            method_mode(&ir, "stream"),
            CandidMethodModeIr::CompositeQuery
        );
        assert_eq!(method_mode(&ir, "write"), CandidMethodModeIr::Update);
        assert_eq!(method_mode(&ir, "notify"), CandidMethodModeIr::Oneway);
    }

    #[test]
    fn json_round_trips_and_preserves_field_labels() {
        let parsed = parse_candid_source(
            r#"
type Fields = record {
  text;
  named : text;
  10 : nat;
};

service : { get : () -> (Fields) query; }
"#,
        )
        .unwrap();
        let actor = parsed.actor.as_ref().unwrap();
        let ir = program_ir(&parsed.env, actor, &parsed.prog).unwrap();

        let json = serde_json::to_string(&ir).unwrap();
        let round_trip: ProgramIr = serde_json::from_str(&json).unwrap();
        assert_eq!(round_trip, ir);

        let fields_decl = round_trip
            .types
            .iter()
            .find(|decl| decl.name == "Fields")
            .unwrap();
        let CandidTypeIr::Record { fields } = &fields_decl.typ else {
            panic!("expected Fields record");
        };
        assert!(fields.iter().any(
            |field| matches!(&field.label, CandidFieldLabelIr::Named { name } if name == "named")
        ));
        assert!(fields
            .iter()
            .any(|field| matches!(field.label, CandidFieldLabelIr::Id { id: 10 })));
        assert!(fields
            .iter()
            .any(|field| matches!(field.label, CandidFieldLabelIr::Unnamed { id: 0 })));
    }

    #[test]
    fn recursive_types_are_represented_as_refs() {
        let parsed = parse_candid_source(
            r#"
type List = opt record {
  head : nat;
  tail : List;
};

service : {
  get : () -> (List) query;
}"#,
        )
        .unwrap();
        let actor = parsed.actor.as_ref().unwrap();
        let ir = program_ir(&parsed.env, actor, &parsed.prog).unwrap();
        println!("{}", serde_json::to_string_pretty(&ir).unwrap());
        // Check that the recursive type is represented as a reference
        let list_decl = ir.types.iter().find(|decl| decl.name == "List").unwrap();
        assert!(matches!(
            &list_decl.typ,
            CandidTypeIr::Opt { inner }
                if matches!(
                    inner.as_ref(),
                    CandidTypeIr::Record { fields }
                        if fields.iter().any(|field| matches!(&field.typ, CandidTypeIr::Ref { name } if name == "List"))
                )
        ));
    }

    #[test]
    fn recursive_service_types_are_represented_as_refs() {
        let parsed = parse_candid_source(
            r#"
type Node = record {
  value : text;
  children : vec Node;
};

service : {
  root : () -> (Node) query;
  save : (Node) -> ();
}"#,
        )
        .unwrap();
        let actor = parsed.actor.as_ref().unwrap();
        let ir = program_ir(&parsed.env, actor, &parsed.prog).unwrap();
        println!("{}", serde_json::to_string_pretty(&ir).unwrap());
        // Check that the recursive type is represented as a reference
        let node_decl = ir.types.iter().find(|decl| decl.name == "Node").unwrap();
        assert!(matches!(
            &node_decl.typ,
            CandidTypeIr::Record { fields }
                if fields.iter().any(|field| matches!(&field.typ, CandidTypeIr::Vec { inner } if matches!(inner.as_ref(), CandidTypeIr::Ref { name } if name == "Node")))
        ));
    }

    mod type_arena_syntax_verification {
        use super::*;
        use candid_parser::syntax::PrimType;

        #[test]
        fn syntax_distinguishes_direct_type_and_declaration_reference() {
            let parsed = parse_candid_source(
                r#"
type UserId = nat64;

service : {
  direct : (nat64) -> ();
  named : (UserId) -> ();
}
"#,
            )
            .unwrap();
            let methods = actor_service_syntax(&parsed.prog).unwrap();
            let direct = find_method(&methods, "direct");
            let named = find_method(&methods, "named");
            let mut context = ArenaLoweringContext::new(&parsed.env, &parsed.prog);
            context.reserve_declarations().unwrap();

            assert!(matches!(
                first_arg_type(direct),
                IDLType::PrimT(PrimType::Nat64)
            ));
            assert!(matches!(
                first_arg_type(named),
                IDLType::VarT(name) if name == "UserId"
            ));
            assert_eq!(
                context
                    .type_ref_from_syntax(first_arg_type(direct), TypeId(7))
                    .unwrap(),
                TypeRefIr::Type { id: TypeId(7) }
            );
            assert_eq!(
                context
                    .type_ref_from_syntax(first_arg_type(named), TypeId(7))
                    .unwrap(),
                TypeRefIr::Decl { id: DeclId(0) }
            );
        }

        #[test]
        fn recursive_type_use_is_source_declaration_reference() {
            let parsed = parse_candid_source(
                r#"
type List = opt record {
  head : nat;
  tail : List;
};
"#,
            )
            .unwrap();
            let mut context = ArenaLoweringContext::new(&parsed.env, &parsed.prog);
            context.reserve_declarations().unwrap();
            let list = parsed.prog.lookup("List").unwrap();
            let IDLType::OptT(inner) = &list.typ else {
                panic!("expected List to be opt, got {:?}", list.typ);
            };
            let IDLType::RecordT(fields) = inner.as_ref() else {
                panic!("expected List inner to be record, got {inner:?}");
            };
            let tail = fields
                .iter()
                .find(|field| matches!(&field.label, Label::Named(name) if name == "tail"))
                .expect("missing tail field");

            assert!(matches!(&tail.typ, IDLType::VarT(name) if name == "List"));
            assert_eq!(
                context.type_ref_from_syntax(&tail.typ, TypeId(99)).unwrap(),
                TypeRefIr::Decl { id: DeclId(0) }
            );
        }

        #[test]
        fn mutual_recursion_decl_refs_are_available_before_body_lowering() {
            let parsed = parse_candid_source(
                r#"
type A = record {
  b : opt B;
};

type B = record {
  a : opt A;
};
"#,
            )
            .unwrap();
            let mut context = ArenaLoweringContext::new(&parsed.env, &parsed.prog);
            context.reserve_declarations().unwrap();

            let a = parsed.prog.lookup("A").unwrap();
            let b = parsed.prog.lookup("B").unwrap();
            let a_b_inner = opt_field_inner(a, "b");
            let b_a_inner = opt_field_inner(b, "a");

            assert_eq!(
                context.type_ref_from_syntax(a_b_inner, TypeId(99)).unwrap(),
                TypeRefIr::Decl { id: DeclId(1) }
            );
            assert_eq!(
                context.type_ref_from_syntax(b_a_inner, TypeId(99)).unwrap(),
                TypeRefIr::Decl { id: DeclId(0) }
            );
        }

        #[test]
        fn named_service_actor_preserves_actor_declaration_reference() {
            let parsed = parse_candid_source(
                r#"
type Backend = service {
  get : () -> (text) query;
};

service : Backend;
"#,
            )
            .unwrap();
            let backend = parsed.prog.lookup("Backend").unwrap();
            let actor = parsed.prog.resolve_actor().unwrap().unwrap();
            let mut context = ArenaLoweringContext::new(&parsed.env, &parsed.prog);
            context.reserve_declarations().unwrap();

            assert!(matches!(&backend.typ, IDLType::ServT(methods) if methods.len() == 1));
            assert!(matches!(&actor.typ, IDLType::VarT(name) if name == "Backend"));
            assert_eq!(
                context
                    .type_ref_from_syntax(&actor.typ, TypeId(99))
                    .unwrap(),
                TypeRefIr::Decl { id: DeclId(0) }
            );
        }

        #[test]
        fn source_order_declaration_reservation_is_deterministic() {
            let source = r#"
type Zed = nat;
type Alpha = text;
type Middle = bool;
"#;

            let reservations = reserve_source_order_decl_ids(source);
            assert_eq!(
                reservations,
                vec![
                    (DeclId(0), "Zed".to_string()),
                    (DeclId(1), "Alpha".to_string()),
                    (DeclId(2), "Middle".to_string()),
                ]
            );

            for _ in 0..3 {
                assert_eq!(reserve_source_order_decl_ids(source), reservations);
            }

            assert_eq!(
                env_sorted_declaration_order(source),
                vec!["Alpha".to_string(), "Middle".to_string(), "Zed".to_string()]
            );
        }

        #[test]
        fn current_program_ir_json_is_deterministic_across_compiles() {
            let source = r#"
type Zed = nat;
type Alpha = record {
  id : Zed;
};

service : {
  get : (Alpha) -> (Zed) query;
}
"#;

            let first = program_ir_json(source);
            for _ in 0..3 {
                assert_eq!(program_ir_json(source), first);
            }
        }

        fn find_method<'a>(methods: &'a [Binding], name: &str) -> &'a Binding {
            methods
                .iter()
                .find(|method| method.id == name)
                .unwrap_or_else(|| panic!("missing method {name}"))
        }

        fn first_arg_type(method: &Binding) -> &IDLType {
            let IDLType::FuncT(func) = &method.typ else {
                panic!("expected method function type, got {:?}", method.typ);
            };
            &func.args.first().expect("missing first argument").typ
        }

        fn opt_field_inner<'a>(binding: &'a Binding, field_name: &str) -> &'a IDLType {
            let IDLType::RecordT(fields) = &binding.typ else {
                panic!(
                    "expected record type for {}, got {:?}",
                    binding.id, binding.typ
                );
            };
            let field = fields
                .iter()
                .find(|field| matches!(&field.label, Label::Named(name) if name == field_name))
                .unwrap_or_else(|| panic!("missing field {field_name}"));
            let IDLType::OptT(inner) = &field.typ else {
                panic!("expected opt field {field_name}, got {:?}", field.typ);
            };

            inner
        }

        fn reserve_source_order_decl_ids(source: &str) -> Vec<(DeclId, String)> {
            let parsed = parse_candid_source(source).unwrap();
            let mut context = ArenaLoweringContext::new(&parsed.env, &parsed.prog);
            context.reserve_declarations().unwrap();
            context
                .declarations()
                .iter()
                .map(|decl| (decl.id, decl.name.clone()))
                .collect()
        }

        fn env_sorted_declaration_order(source: &str) -> Vec<String> {
            let parsed = parse_candid_source(source).unwrap();
            parsed
                .env
                .to_sorted_iter()
                .map(|(name, _)| name.to_string())
                .collect()
        }

        fn program_ir_json(source: &str) -> String {
            let parsed = parse_candid_source(source).unwrap();
            let ir =
                program_ir_from_parts(&parsed.env, parsed.actor.as_ref(), &parsed.prog).unwrap();
            serde_json::to_string(&ir).unwrap()
        }
    }

    mod type_arena_allocation_verification {
        use super::*;

        #[test]
        fn primitive_type_allocation_reuses_type_ids() {
            let parsed = parse_candid_source(
                r#"
type UserId = nat64;
type TransactionId = nat64;
"#,
            )
            .unwrap();
            let mut context = ArenaLoweringContext::new(&parsed.env, &parsed.prog);
            context.reserve_declarations().unwrap();

            let user_id = context
                .lower_type(&parsed.prog.lookup("UserId").unwrap().typ)
                .unwrap();
            let transaction_id = context
                .lower_type(&parsed.prog.lookup("TransactionId").unwrap().typ)
                .unwrap();

            assert_eq!(user_id, TypeId(0));
            assert_eq!(transaction_id, TypeId(0));
            assert_eq!(
                context.types(),
                &[TypeNodeIr {
                    kind: TypeKindIr::Nat64,
                }]
            );
        }

        #[test]
        fn repeated_anonymous_composites_allocate_distinct_type_ids() {
            let parsed = parse_candid_source(
                r#"
service : {
  a : (record { value : text }) -> ();
  b : (record { value : text }) -> ();
}
"#,
            )
            .unwrap();
            let mut context = ArenaLoweringContext::new(&parsed.env, &parsed.prog);
            context.reserve_declarations().unwrap();
            let methods = actor_service_syntax(&parsed.prog).unwrap();
            let a = first_arg_type(find_method(&methods, "a"));
            let b = first_arg_type(find_method(&methods, "b"));

            let a_ref = context.lower_type_ref(a).unwrap();
            let b_ref = context.lower_type_ref(b).unwrap();

            assert_eq!(a_ref, TypeRefIr::Type { id: TypeId(1) });
            assert_eq!(b_ref, TypeRefIr::Type { id: TypeId(2) });
            assert_ne!(a_ref, b_ref);
            assert_eq!(context.types().len(), 3);
            assert_eq!(context.type_node(TypeId(0)).unwrap().kind, TypeKindIr::Text);
            assert_eq!(
                record_field(context.type_node(TypeId(1)).unwrap(), "value").typ,
                TypeRefIr::Type { id: TypeId(0) }
            );
            assert_eq!(
                record_field(context.type_node(TypeId(2)).unwrap(), "value").typ,
                TypeRefIr::Type { id: TypeId(0) }
            );
            assert_eq!(
                context.type_node(TypeId(1)).unwrap(),
                context.type_node(TypeId(2)).unwrap()
            );
        }

        #[test]
        fn composite_allocation_preserves_named_declaration_refs() {
            let parsed = parse_candid_source(
                r#"
type UserId = nat64;
type Profile = record {
  id : UserId;
  aliases : vec text;
};
"#,
            )
            .unwrap();
            let mut context = ArenaLoweringContext::new(&parsed.env, &parsed.prog);
            context.reserve_declarations().unwrap();

            let profile = context
                .lower_type(&parsed.prog.lookup("Profile").unwrap().typ)
                .unwrap();
            let fields = record_fields(context.type_node(profile).unwrap());
            let id = find_field(fields, "id");
            let aliases = find_field(fields, "aliases");

            assert_eq!(profile, TypeId(2));
            assert_eq!(id.typ, TypeRefIr::Decl { id: DeclId(0) });
            assert_eq!(aliases.typ, TypeRefIr::Type { id: TypeId(1) });
            assert_eq!(context.type_node(TypeId(0)).unwrap().kind, TypeKindIr::Text);
            assert_eq!(
                context.type_node(TypeId(1)).unwrap().kind,
                TypeKindIr::Vec {
                    inner: TypeRefIr::Type { id: TypeId(0) },
                }
            );
        }

        fn find_method<'a>(methods: &'a [Binding], name: &str) -> &'a Binding {
            methods
                .iter()
                .find(|method| method.id == name)
                .unwrap_or_else(|| panic!("missing method {name}"))
        }

        fn first_arg_type(method: &Binding) -> &IDLType {
            let IDLType::FuncT(func) = &method.typ else {
                panic!("expected method function type, got {:?}", method.typ);
            };
            &func.args.first().expect("missing first argument").typ
        }

        fn record_field<'a>(node: &'a TypeNodeIr, name: &str) -> &'a FieldIr {
            find_field(record_fields(node), name)
        }

        fn record_fields(node: &TypeNodeIr) -> &[FieldIr] {
            match &node.kind {
                TypeKindIr::Record { fields } => fields,
                other => panic!("expected record node, got {other:?}"),
            }
        }

        fn find_field<'a>(fields: &'a [FieldIr], name: &str) -> &'a FieldIr {
            fields
                .iter()
                .find(|field| matches!(&field.label, FieldLabelIr::Named { name: field_name, .. } if field_name == name))
                .unwrap_or_else(|| panic!("missing field {name}"))
        }
    }

    mod type_arena_conceptual_fixtures {
        use super::*;

        #[derive(Debug, Clone, PartialEq, Eq)]
        struct ConceptualProgram {
            declarations: Vec<ConceptualDecl>,
            types: Vec<ConceptualType>,
            actor: Option<ConceptualActor>,
        }

        #[derive(Debug, Clone, PartialEq, Eq)]
        struct ConceptualDecl {
            id: DeclId,
            name: &'static str,
            typ: TypeId,
        }

        #[derive(Debug, Clone, PartialEq, Eq)]
        struct ConceptualActor {
            init_args: Vec<TypeRefIr>,
            service: TypeId,
        }

        #[derive(Debug, Clone, PartialEq, Eq)]
        enum ConceptualType {
            Nat,
            Nat64,
            Text,
            Opt(TypeRefIr),
            Record(Vec<ConceptualField>),
            Service(Vec<ConceptualMethod>),
        }

        #[derive(Debug, Clone, PartialEq, Eq)]
        struct ConceptualField {
            label: &'static str,
            typ: TypeRefIr,
        }

        #[derive(Debug, Clone, PartialEq, Eq)]
        struct ConceptualMethod {
            name: &'static str,
            mode: CandidMethodModeIr,
            args: Vec<TypeRefIr>,
            returns: Vec<TypeRefIr>,
        }

        impl ConceptualProgram {
            fn decl(&self, id: DeclId) -> &ConceptualDecl {
                self.declarations
                    .get(id_index(id.0))
                    .unwrap_or_else(|| panic!("missing declaration {id:?}"))
            }

            fn type_node(&self, id: TypeId) -> &ConceptualType {
                self.types
                    .get(id_index(id.0))
                    .unwrap_or_else(|| panic!("missing type {id:?}"))
            }

            fn resolve(&self, reference: TypeRefIr) -> TypeId {
                match reference {
                    TypeRefIr::Type { id } => id,
                    TypeRefIr::Decl { id } => self.decl(id).typ,
                }
            }
        }

        #[test]
        fn declaration_identity() {
            let program = ConceptualProgram {
                declarations: vec![
                    ConceptualDecl {
                        id: DeclId(0),
                        name: "UserId",
                        typ: TypeId(0),
                    },
                    ConceptualDecl {
                        id: DeclId(1),
                        name: "TransactionId",
                        typ: TypeId(0),
                    },
                ],
                types: vec![ConceptualType::Nat64],
                actor: None,
            };

            assert!(program.actor.is_none());
            assert_ne!(DeclId(0), DeclId(1));
            assert_eq!(program.decl(DeclId(0)).id, DeclId(0));
            assert_eq!(program.decl(DeclId(1)).id, DeclId(1));
            assert_eq!(program.decl(DeclId(0)).name, "UserId");
            assert_eq!(program.decl(DeclId(1)).name, "TransactionId");
            assert_eq!(program.resolve(decl_ref(0)), TypeId(0));
            assert_eq!(program.resolve(decl_ref(1)), TypeId(0));
            assert_eq!(program.type_node(TypeId(0)), &ConceptualType::Nat64);
            assert_eq!(
                serde_json::to_value(type_ref(5)).unwrap(),
                serde_json::json!({ "kind": "type", "id": 5 })
            );
            assert_eq!(
                serde_json::to_value(decl_ref(2)).unwrap(),
                serde_json::json!({ "kind": "decl", "id": 2 })
            );
        }

        #[test]
        fn recursive_type() {
            let program = ConceptualProgram {
                declarations: vec![ConceptualDecl {
                    id: DeclId(0),
                    name: "List",
                    typ: TypeId(2),
                }],
                types: vec![
                    ConceptualType::Nat,
                    ConceptualType::Record(vec![
                        field("head", type_ref(0)),
                        field("tail", decl_ref(0)),
                    ]),
                    ConceptualType::Opt(type_ref(1)),
                ],
                actor: None,
            };

            let fields = record_fields(program.type_node(TypeId(1)));
            let tail = find_field(fields, "tail");

            assert_eq!(program.decl(DeclId(0)).typ, TypeId(2));
            assert_eq!(tail.typ, decl_ref(0));
            assert_eq!(program.resolve(tail.typ), TypeId(2));
            assert!(matches!(tail.typ, TypeRefIr::Decl { id: DeclId(0) }));
        }

        #[test]
        fn mutual_recursion() {
            let program = ConceptualProgram {
                declarations: vec![
                    ConceptualDecl {
                        id: DeclId(0),
                        name: "A",
                        typ: TypeId(1),
                    },
                    ConceptualDecl {
                        id: DeclId(1),
                        name: "B",
                        typ: TypeId(3),
                    },
                ],
                types: vec![
                    ConceptualType::Opt(decl_ref(1)),
                    ConceptualType::Record(vec![field("b", type_ref(0))]),
                    ConceptualType::Opt(decl_ref(0)),
                    ConceptualType::Record(vec![field("a", type_ref(2))]),
                ],
                actor: None,
            };

            let a_fields = record_fields(program.type_node(program.decl(DeclId(0)).typ));
            let b_reference =
                opt_inner(program.type_node(program.resolve(find_field(a_fields, "b").typ)));
            assert_eq!(b_reference, decl_ref(1));

            let b_fields = record_fields(program.type_node(program.decl(DeclId(1)).typ));
            let a_reference =
                opt_inner(program.type_node(program.resolve(find_field(b_fields, "a").typ)));
            assert_eq!(a_reference, decl_ref(0));
        }

        #[test]
        fn named_service_actor() {
            let program = ConceptualProgram {
                declarations: vec![ConceptualDecl {
                    id: DeclId(0),
                    name: "Backend",
                    typ: TypeId(1),
                }],
                types: vec![
                    ConceptualType::Text,
                    ConceptualType::Service(vec![method(
                        "get",
                        CandidMethodModeIr::Query,
                        vec![],
                        vec![type_ref(0)],
                    )]),
                ],
                actor: Some(ConceptualActor {
                    init_args: vec![],
                    service: TypeId(1),
                }),
            };

            let actor = program.actor.as_ref().unwrap();
            assert!(actor.init_args.is_empty());
            assert_eq!(actor.service, program.decl(DeclId(0)).typ);

            let methods = service_methods(program.type_node(actor.service));
            assert_eq!(methods.len(), 1);
            assert_eq!(methods[0].name, "get");
            assert_eq!(methods[0].mode, CandidMethodModeIr::Query);
            assert_eq!(methods[0].returns, vec![type_ref(0)]);
            assert_eq!(
                program.type_node(program.resolve(methods[0].returns[0])),
                &ConceptualType::Text
            );
        }

        #[test]
        fn repeated_anonymous_types() {
            let repeated_record = ConceptualType::Record(vec![field("value", type_ref(0))]);
            let program = ConceptualProgram {
                declarations: vec![],
                types: vec![
                    ConceptualType::Text,
                    repeated_record.clone(),
                    repeated_record,
                    ConceptualType::Service(vec![
                        method("a", CandidMethodModeIr::Update, vec![type_ref(1)], vec![]),
                        method("b", CandidMethodModeIr::Update, vec![type_ref(2)], vec![]),
                    ]),
                ],
                actor: Some(ConceptualActor {
                    init_args: vec![],
                    service: TypeId(3),
                }),
            };

            assert_ne!(TypeId(1), TypeId(2));
            assert_eq!(program.type_node(TypeId(1)), program.type_node(TypeId(2)));

            let actor = program.actor.as_ref().unwrap();
            let methods = service_methods(program.type_node(actor.service));
            assert_eq!(methods[0].args, vec![type_ref(1)]);
            assert_eq!(methods[1].args, vec![type_ref(2)]);
        }

        fn type_ref(id: u32) -> TypeRefIr {
            TypeRefIr::Type { id: TypeId(id) }
        }

        fn decl_ref(id: u32) -> TypeRefIr {
            TypeRefIr::Decl { id: DeclId(id) }
        }

        fn field(label: &'static str, typ: TypeRefIr) -> ConceptualField {
            ConceptualField { label, typ }
        }

        fn method(
            name: &'static str,
            mode: CandidMethodModeIr,
            args: Vec<TypeRefIr>,
            returns: Vec<TypeRefIr>,
        ) -> ConceptualMethod {
            ConceptualMethod {
                name,
                mode,
                args,
                returns,
            }
        }

        fn find_field<'a>(fields: &'a [ConceptualField], expected: &str) -> &'a ConceptualField {
            fields
                .iter()
                .find(|field| field.label == expected)
                .unwrap_or_else(|| panic!("missing field {expected}"))
        }

        fn opt_inner(typ: &ConceptualType) -> TypeRefIr {
            match typ {
                ConceptualType::Opt(inner) => *inner,
                other => panic!("expected opt type, got {other:?}"),
            }
        }

        fn record_fields(typ: &ConceptualType) -> &[ConceptualField] {
            match typ {
                ConceptualType::Record(fields) => fields,
                other => panic!("expected record type, got {other:?}"),
            }
        }

        fn service_methods(typ: &ConceptualType) -> &[ConceptualMethod] {
            match typ {
                ConceptualType::Service(methods) => methods,
                other => panic!("expected service type, got {other:?}"),
            }
        }

        fn id_index(id: u32) -> usize {
            usize::try_from(id).expect("fixture ID does not fit usize")
        }
    }

    fn named(field: &CandidFieldIr, expected: &str) -> bool {
        matches!(&field.label, CandidFieldLabelIr::Named { name } if name == expected)
    }

    fn method_mode(ir: &ProgramIr, name: &str) -> CandidMethodModeIr {
        ir.actor
            .as_ref()
            .unwrap()
            .service
            .methods
            .iter()
            .find(|method| method.name == name)
            .unwrap()
            .mode
    }
}
