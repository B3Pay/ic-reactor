use candid::types::{FuncMode, Label, Type, TypeEnv, TypeInner};
use candid_parser::syntax::{Binding, Dec, IDLActorType, IDLMergedProg, IDLType, TypeField};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

use crate::metadata;

#[derive(Clone, Serialize)]
pub(crate) struct CandidSchema {
    pub(crate) types: Vec<CandidTypeDeclaration>,
    pub(crate) service: Option<CandidServiceDeclaration>,
}

#[derive(Clone, Serialize)]
pub(crate) struct CandidTypeDeclaration {
    pub(crate) name: String,
    #[serde(rename = "type")]
    pub(crate) ty: CandidType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) metadata: Option<crate::metadata::CandidMetadata>,
}

#[derive(Clone, Serialize)]
pub(crate) struct CandidServiceDeclaration {
    pub(crate) methods: Vec<CandidMethodDeclaration>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) metadata: Option<crate::metadata::CandidMetadata>,
}

#[derive(Clone, Serialize)]
pub(crate) struct CandidMethodDeclaration {
    pub(crate) name: String,
    pub(crate) mode: &'static str,
    pub(crate) args: Vec<CandidType>,
    pub(crate) returns: Vec<CandidType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) metadata: Option<crate::metadata::CandidMetadata>,
}

#[derive(Clone, Serialize)]
pub(crate) struct CandidField {
    pub(crate) name: String,
    #[serde(rename = "type")]
    pub(crate) ty: CandidType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) metadata: Option<crate::metadata::CandidMetadata>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum CandidType {
    Null,
    Bool,
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
    Text,
    Reserved,
    Empty,
    Principal,
    Blob,
    Reference { name: String },
    Opt {
        #[serde(rename = "type")]
        ty: Box<CandidType>,
    },
    Vec {
        #[serde(rename = "type")]
        ty: Box<CandidType>,
    },
    Record { fields: Vec<CandidField> },
    Variant { fields: Vec<CandidField> },
    Tuple { types: Vec<CandidType> },
    Func,
    Service,
    Class,
    Unknown,
    Knot,
    Future,
}

fn label_to_string(label: &Label) -> String {
    match label {
        Label::Id(id) => id.to_string(),
        Label::Unnamed(id) => id.to_string(),
        Label::Named(name) => name.clone(),
    }
}

fn syntax_field_for<'a>(fields: Option<&'a [TypeField]>, label: &Label) -> Option<&'a TypeField> {
    fields?.iter().find(|field| field.label == *label)
}

fn type_to_schema(ty: &Type, syntax_ty: Option<&IDLType>) -> CandidType {
    match ty.as_ref() {
        TypeInner::Null => CandidType::Null,
        TypeInner::Bool => CandidType::Bool,
        TypeInner::Nat => CandidType::Nat,
        TypeInner::Int => CandidType::Int,
        TypeInner::Nat8 => CandidType::Nat8,
        TypeInner::Nat16 => CandidType::Nat16,
        TypeInner::Nat32 => CandidType::Nat32,
        TypeInner::Nat64 => CandidType::Nat64,
        TypeInner::Int8 => CandidType::Int8,
        TypeInner::Int16 => CandidType::Int16,
        TypeInner::Int32 => CandidType::Int32,
        TypeInner::Int64 => CandidType::Int64,
        TypeInner::Float32 => CandidType::Float32,
        TypeInner::Float64 => CandidType::Float64,
        TypeInner::Text => CandidType::Text,
        TypeInner::Reserved => CandidType::Reserved,
        TypeInner::Empty => CandidType::Empty,
        TypeInner::Principal => CandidType::Principal,
        TypeInner::Var(name) => CandidType::Reference { name: name.clone() },
        TypeInner::Opt(inner) => CandidType::Opt {
            ty: Box::new(type_to_schema(
                inner,
                match syntax_ty {
                    Some(IDLType::OptT(inner)) => Some(inner),
                    _ => None,
                },
            )),
        },
        TypeInner::Vec(inner) => {
            if let TypeInner::Nat8 = inner.as_ref() {
                CandidType::Blob
            } else {
                CandidType::Vec {
                    ty: Box::new(type_to_schema(
                        inner,
                        match syntax_ty {
                            Some(IDLType::VecT(inner)) => Some(inner),
                            _ => None,
                        },
                    )),
                }
            }
        }
        TypeInner::Record(fields) => {
            let syntax_fields = match syntax_ty {
                Some(IDLType::RecordT(fields)) => Some(fields.as_slice()),
                _ => None,
            };
            let is_tuple = fields.iter().enumerate().all(|(idx, field)| {
                matches!(
                    *field.id,
                    Label::Id(id) | Label::Unnamed(id) if id == idx as u32
                )
            });

            if is_tuple && !fields.is_empty() {
                CandidType::Tuple {
                    types: fields
                        .iter()
                        .map(|field| {
                            let syntax_field = syntax_field_for(syntax_fields, &field.id);
                            type_to_schema(&field.ty, syntax_field.map(|field| &field.typ))
                        })
                        .collect(),
                }
            } else {
                CandidType::Record {
                    fields: fields
                        .iter()
                        .map(|field| CandidField {
                            name: label_to_string(&field.id),
                            ty: {
                                let syntax_field = syntax_field_for(syntax_fields, &field.id);
                                type_to_schema(&field.ty, syntax_field.map(|field| &field.typ))
                            },
                            metadata: syntax_field_for(syntax_fields, &field.id)
                                .and_then(|field| metadata::metadata_from_docs(&field.docs)),
                        })
                        .collect(),
                }
            }
        }
        TypeInner::Variant(fields) => {
            let syntax_fields = match syntax_ty {
                Some(IDLType::VariantT(fields)) => Some(fields.as_slice()),
                _ => None,
            };
            CandidType::Variant {
                fields: fields
                    .iter()
                    .map(|field| {
                        let syntax_field = syntax_field_for(syntax_fields, &field.id);
                        CandidField {
                            name: label_to_string(&field.id),
                            ty: type_to_schema(&field.ty, syntax_field.map(|field| &field.typ)),
                            metadata: syntax_field
                                .and_then(|field| metadata::metadata_from_docs(&field.docs)),
                        }
                    })
                    .collect(),
            }
        }
        TypeInner::Func(_) => CandidType::Func,
        TypeInner::Service(_) => CandidType::Service,
        TypeInner::Class(_, _) => CandidType::Class,
        TypeInner::Unknown => CandidType::Unknown,
        TypeInner::Knot(_) => CandidType::Knot,
        TypeInner::Future => CandidType::Future,
    }
}

fn type_bindings_by_name(declarations: &[Dec]) -> HashMap<String, &Binding> {
    declarations
        .iter()
        .filter_map(|dec| match dec {
            Dec::TypD(binding) => Some((binding.id.clone(), binding)),
            Dec::ImportType(_) | Dec::ImportServ(_) => None,
        })
        .collect()
}

fn service_method_bindings_from_actor<'a>(
    actor: Option<&'a IDLActorType>,
    type_bindings: &HashMap<String, &'a Binding>,
) -> Vec<&'a Binding> {
    fn service_methods_from_type<'a>(
        ty: &'a IDLType,
        type_bindings: &HashMap<String, &'a Binding>,
    ) -> Vec<&'a Binding> {
        match ty {
            IDLType::ServT(methods) => methods.iter().collect(),
            IDLType::ClassT(_, inner) => service_methods_from_type(inner, type_bindings),
            IDLType::VarT(name) => type_bindings
                .get(name)
                .map(|binding| service_methods_from_type(&binding.typ, type_bindings))
                .unwrap_or_default(),
            _ => Vec::new(),
        }
    }

    actor
        .map(|actor| service_methods_from_type(&actor.typ, type_bindings))
        .unwrap_or_default()
}

fn syntax_func_for_method(binding: Option<&Binding>) -> Option<&candid_parser::syntax::FuncType> {
    match binding.map(|binding| &binding.typ) {
        Some(IDLType::FuncT(func)) => Some(func),
        _ => None,
    }
}

pub(crate) fn parse_did_schema(prog: &str) -> Result<CandidSchema, String> {
    let (env, actor, merged) = crate::check_source(prog)?;
    schema_from_checked(&env, &actor, &merged)
}

pub(crate) fn parse_did_file_schema(file: &str) -> Result<CandidSchema, String> {
    let (env, actor, merged) = crate::check_file(file)?;
    schema_from_checked(&env, &actor, &merged)
}

pub(crate) fn schema_from_checked(
    env: &TypeEnv,
    actor: &Option<Type>,
    merged: &IDLMergedProg,
) -> Result<CandidSchema, String> {
    let declarations = merged.decs();
    let syntax_actor = merged.resolve_actor().map_err(|e| e.to_string())?;
    let type_bindings = type_bindings_by_name(&declarations);
    let method_bindings = service_method_bindings_from_actor(syntax_actor.as_ref(), &type_bindings);

    let mut emitted_type_names = HashSet::new();
    let mut types = Vec::new();

    for dec in &declarations {
        if let Dec::TypD(binding) = dec {
            if let Some(ty) = env.0.get(&binding.id) {
                emitted_type_names.insert(binding.id.clone());
                types.push(CandidTypeDeclaration {
                    name: binding.id.clone(),
                    ty: type_to_schema(ty, Some(&binding.typ)),
                    metadata: metadata::metadata_from_docs(&binding.docs),
                });
            }
        }
    }

    for (name, ty) in env.0.iter() {
        if emitted_type_names.contains(name) {
            continue;
        }

        let binding = type_bindings.get(name).copied();
        types.push(CandidTypeDeclaration {
            name: name.clone(),
            ty: type_to_schema(ty, binding.map(|binding| &binding.typ)),
            metadata: binding.and_then(|binding| metadata::metadata_from_docs(&binding.docs)),
        });
    }

    let service = actor.as_ref().and_then(|actor_ty| {
        let service_ty = match actor_ty.as_ref() {
            TypeInner::Class(_, inner) => inner.clone(),
            _ => actor_ty.clone(),
        };

        if let TypeInner::Service(methods) = service_ty.as_ref() {
            let methods = methods
                .iter()
                .filter_map(|(name, ty)| {
                    if let TypeInner::Func(func) = ty.as_ref() {
                        let binding = method_bindings
                            .iter()
                            .find(|binding| binding.id == *name)
                            .copied();
                        let syntax_func = syntax_func_for_method(binding);
                        let mode = if func.modes.contains(&FuncMode::Oneway) {
                            "oneway"
                        } else if func.modes.contains(&FuncMode::Query) {
                            "query"
                        } else {
                            "update"
                        };

                        Some(CandidMethodDeclaration {
                            name: name.clone(),
                            mode,
                            args: func
                                .args
                                .iter()
                                .enumerate()
                                .map(|(index, arg)| {
                                    type_to_schema(
                                        arg,
                                        syntax_func
                                            .and_then(|func| func.args.get(index))
                                            .map(|arg| &arg.typ),
                                    )
                                })
                                .collect(),
                            returns: func
                                .rets
                                .iter()
                                .enumerate()
                                .map(|(index, ret)| {
                                    type_to_schema(
                                        ret,
                                        syntax_func
                                            .and_then(|func| func.rets.get(index))
                                            .map(|ret| &ret.typ),
                                    )
                                })
                                .collect(),
                            metadata: binding.and_then(|binding| metadata::metadata_from_docs(&binding.docs)),
                        })
                    } else {
                        None
                    }
                })
                .collect();

            Some(CandidServiceDeclaration {
                methods,
                metadata: syntax_actor
                    .as_ref()
                    .and_then(|actor| metadata::metadata_from_docs(&actor.docs)),
            })
        } else {
            None
        }
    });

    Ok(CandidSchema { types, service })
}
