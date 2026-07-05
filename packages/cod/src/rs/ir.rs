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

use anyhow::{anyhow, Context, Result};
use candid::types::{FuncMode, Label, SharedLabel, Type, TypeEnv, TypeInner};
use candid_parser::syntax::{Binding, IDLArgType, IDLMergedProg, IDLType};
use serde::{Deserialize, Serialize};

use crate::docs::{DocBlock, DocTag};

pub const PROGRAM_IR_VERSION: u16 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProgramIr {
    pub version: u16,
    pub types: Vec<CandidTypeDeclIr>,
    pub actor: CandidActorIr,
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

    let actor = match actor {
        Some(actor) => actor_ir(env, actor, prog)?,
        None => CandidActorIr {
            init_args: Vec::new(),
            service: CandidServiceIr {
                methods: Vec::new(),
            },
        },
    };

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
    fields: &[candid::types::Field],
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
        assert_eq!(ir.actor.service.methods[0].mode, CandidMethodModeIr::Query);
        assert_eq!(ir.actor.service.methods[0].docs, vec!["Balance docs."]);
        assert!(matches!(
            ir.actor.service.methods[0].args[0].typ,
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

        let method = &ir.actor.service.methods[0];
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
        assert_eq!(ir.actor.init_args.len(), 2);
        assert_eq!(ir.actor.service.methods.len(), 1);
        assert_eq!(ir.actor.service.methods[0].mode, CandidMethodModeIr::Query);
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

    fn named(field: &CandidFieldIr, expected: &str) -> bool {
        matches!(&field.label, CandidFieldLabelIr::Named { name } if name == expected)
    }

    fn method_mode(ir: &ProgramIr, name: &str) -> CandidMethodModeIr {
        ir.actor
            .service
            .methods
            .iter()
            .find(|method| method.name == name)
            .unwrap()
            .mode
    }
}
