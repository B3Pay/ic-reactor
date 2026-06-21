use candid_parser::syntax::IDLMergedProg;
use candid_parser::{check_prog, IDLProg, TypeEnv};
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(js_name = didToJs)]
pub fn did_to_js(prog: String) -> Result<String, String> {
    let ast = prog.parse::<IDLProg>().map_err(|e| e.to_string())?;
    let mut env = TypeEnv::new();
    let actor = check_prog(&mut env, &ast).map_err(|e| e.to_string())?;

    let res = candid_parser::bindings::javascript::compile(&env, &actor);

    Ok(res)
}

#[wasm_bindgen(js_name = didToTs)]
pub fn did_to_ts(prog: String) -> Result<String, String> {
    let ast = prog.parse::<IDLProg>().map_err(|e| e.to_string())?;
    let mut env = TypeEnv::new();
    let actor = check_prog(&mut env, &ast).map_err(|e| e.to_string())?;

    let merged = IDLMergedProg::new(ast);
    let res = candid_parser::bindings::typescript::compile(&env, &actor, &merged);

    Ok(res)
}

#[wasm_bindgen(js_name = validateIDL)]
pub fn validate_idl(prog: String) -> Result<bool, String> {
    let ast = prog.parse::<IDLProg>().map_err(|e| e.to_string())?;
    let mut env = TypeEnv::new();
    check_prog(&mut env, &ast).map_err(|e| e.to_string())?;
    Ok(true)
}

#[wasm_bindgen(js_name = verifyCompatability)]
pub fn verify_compatability(a: String, b: String) -> Result<bool, String> {
    let a = candid_parser::utils::CandidSource::Text(&a);
    let b = candid_parser::utils::CandidSource::Text(&b);

    let res = candid_parser::utils::service_compatible(a, b);

    match res {
        Ok(_) => Ok(true),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Serialize)]
struct CandidSchema {
    types: Vec<CandidTypeDeclaration>,
    service: Option<CandidServiceDeclaration>,
}

#[derive(Serialize)]
struct CandidTypeDeclaration {
    name: String,
    #[serde(rename = "type")]
    ty: CandidType,
}

#[derive(Serialize)]
struct CandidServiceDeclaration {
    methods: Vec<CandidMethodDeclaration>,
}

#[derive(Serialize)]
struct CandidMethodDeclaration {
    name: String,
    mode: &'static str,
    args: Vec<CandidType>,
    returns: Vec<CandidType>,
}

#[derive(Serialize)]
struct CandidField {
    name: String,
    #[serde(rename = "type")]
    ty: CandidType,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum CandidType {
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
    Reference {
        name: String,
    },
    Opt {
        #[serde(rename = "type")]
        ty: Box<CandidType>,
    },
    Vec {
        #[serde(rename = "type")]
        ty: Box<CandidType>,
    },
    Record {
        fields: Vec<CandidField>,
    },
    Variant {
        fields: Vec<CandidField>,
    },
    Tuple {
        types: Vec<CandidType>,
    },
    Func,
    Service,
    Class,
    Unknown,
    Knot,
    Future,
}

fn label_to_string(label: &candid_parser::candid::types::Label) -> String {
    match label {
        candid_parser::candid::types::Label::Id(id) => id.to_string(),
        candid_parser::candid::types::Label::Unnamed(id) => id.to_string(),
        candid_parser::candid::types::Label::Named(name) => name.clone(),
    }
}

fn type_to_schema(ty: &candid_parser::candid::types::Type) -> CandidType {
    use candid_parser::candid::types::TypeInner;

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
            ty: Box::new(type_to_schema(inner)),
        },
        TypeInner::Vec(inner) => {
            if let TypeInner::Nat8 = inner.as_ref() {
                CandidType::Blob
            } else {
                CandidType::Vec {
                    ty: Box::new(type_to_schema(inner)),
                }
            }
        }
        TypeInner::Record(fields) => {
            let is_tuple = fields.iter().enumerate().all(|(idx, field)| {
                matches!(
                    *field.id,
                    candid_parser::candid::types::Label::Id(id)
                        | candid_parser::candid::types::Label::Unnamed(id)
                        if id == idx as u32
                )
            });

            if is_tuple && !fields.is_empty() {
                CandidType::Tuple {
                    types: fields
                        .iter()
                        .map(|field| type_to_schema(&field.ty))
                        .collect(),
                }
            } else {
                CandidType::Record {
                    fields: fields
                        .iter()
                        .map(|field| CandidField {
                            name: label_to_string(&field.id),
                            ty: type_to_schema(&field.ty),
                        })
                        .collect(),
                }
            }
        }
        TypeInner::Variant(fields) => CandidType::Variant {
            fields: fields
                .iter()
                .map(|field| CandidField {
                    name: label_to_string(&field.id),
                    ty: type_to_schema(&field.ty),
                })
                .collect(),
        },
        TypeInner::Func(_) => CandidType::Func,
        TypeInner::Service(_) => CandidType::Service,
        TypeInner::Class(_, _) => CandidType::Class,
        TypeInner::Unknown => CandidType::Unknown,
        TypeInner::Knot(_) => CandidType::Knot,
        TypeInner::Future => CandidType::Future,
    }
}

#[wasm_bindgen(js_name = parseDid)]
pub fn parse_did(prog: String) -> Result<JsValue, String> {
    let ast = prog.parse::<IDLProg>().map_err(|e| e.to_string())?;
    let mut env = TypeEnv::new();
    let actor = check_prog(&mut env, &ast).map_err(|e| e.to_string())?;

    let types = env
        .0
        .into_iter()
        .map(|(name, ty)| CandidTypeDeclaration {
            name,
            ty: type_to_schema(&ty),
        })
        .collect();

    let service = actor.and_then(|actor_ty| {
        let service_ty = match actor_ty.as_ref() {
            candid_parser::candid::types::TypeInner::Class(_, inner) => inner.clone(),
            _ => actor_ty,
        };

        if let candid_parser::candid::types::TypeInner::Service(methods) = service_ty.as_ref() {
            let methods = methods
                .iter()
                .filter_map(|(name, ty)| {
                    if let candid_parser::candid::types::TypeInner::Func(func) = ty.as_ref() {
                        let mode = if func
                            .modes
                            .contains(&candid_parser::candid::types::FuncMode::Oneway)
                        {
                            "oneway"
                        } else if func
                            .modes
                            .contains(&candid_parser::candid::types::FuncMode::Query)
                        {
                            "query"
                        } else {
                            "update"
                        };

                        Some(CandidMethodDeclaration {
                            name: name.clone(),
                            mode,
                            args: func.args.iter().map(type_to_schema).collect(),
                            returns: func.rets.iter().map(type_to_schema).collect(),
                        })
                    } else {
                        None
                    }
                })
                .collect();

            Some(CandidServiceDeclaration { methods })
        } else {
            None
        }
    });

    serde_wasm_bindgen::to_value(&CandidSchema { types, service }).map_err(|e| e.to_string())
}
