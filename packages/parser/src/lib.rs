use candid_parser::syntax::{
    Binding, Dec, IDLActorType, IDLMergedProg, IDLProg, IDLType, TypeField,
};
use candid_parser::{check_prog, TypeEnv};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use wasm_bindgen::prelude::*;

mod cod;

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

#[derive(Clone, Serialize)]
struct CandidSchema {
    types: Vec<CandidTypeDeclaration>,
    service: Option<CandidServiceDeclaration>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CandidMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    docs: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    validation: Option<CandidValidationMetadata>,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct CandidValidationMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    minimum: Option<CandidValidationBound>,
    #[serde(skip_serializing_if = "Option::is_none")]
    maximum: Option<CandidValidationBound>,
    #[serde(skip_serializing_if = "Option::is_none")]
    min_length: Option<CandidValidationBound>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_length: Option<CandidValidationBound>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pattern: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    format: Option<CandidValidationFormat>,
}

#[derive(Clone, Serialize)]
struct CandidValidationBound {
    value: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CandidValidationFormat {
    r#type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    regex: Option<String>,
    #[serde(rename = "jsonSchemaFormat", skip_serializing_if = "Option::is_none")]
    json_schema_format: Option<String>,
    #[serde(rename = "contentEncoding", skip_serializing_if = "Option::is_none")]
    content_encoding: Option<String>,
    #[serde(rename = "errorMessage", skip_serializing_if = "Option::is_none")]
    error_message: Option<String>,
}

#[derive(Clone, Serialize)]
struct CandidTypeDeclaration {
    name: String,
    #[serde(rename = "type")]
    ty: CandidType,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<CandidMetadata>,
}

#[derive(Clone, Serialize)]
struct CandidServiceDeclaration {
    methods: Vec<CandidMethodDeclaration>,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<CandidMetadata>,
}

#[derive(Clone, Serialize)]
struct CandidMethodDeclaration {
    name: String,
    mode: &'static str,
    args: Vec<CandidType>,
    returns: Vec<CandidType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<CandidMetadata>,
}

#[derive(Clone, Serialize)]
struct CandidField {
    name: String,
    #[serde(rename = "type")]
    ty: CandidType,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<CandidMetadata>,
}

#[derive(Clone, Serialize)]
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

fn metadata_from_docs(docs: &[String]) -> Option<CandidMetadata> {
    if docs.is_empty() {
        return None;
    }

    let normalized_docs: Vec<String> = docs.iter().map(|line| normalize_doc_line(line)).collect();
    let description_lines: Vec<String> = normalized_docs
        .iter()
        .map(|line| line.as_str())
        .filter(|line| !line.is_empty() && !line.starts_with('@'))
        .map(str::to_string)
        .collect();
    let description = if description_lines.is_empty() {
        None
    } else {
        Some(description_lines.join("\n"))
    };
    let validation = validation_from_docs(&normalized_docs);

    Some(CandidMetadata {
        description,
        docs: normalized_docs,
        validation,
    })
}

fn normalize_doc_line(line: &str) -> String {
    line.trim()
        .strip_prefix('/')
        .map(str::trim)
        .unwrap_or_else(|| line.trim())
        .to_string()
}

fn validation_from_docs(docs: &[String]) -> Option<CandidValidationMetadata> {
    let mut validation = CandidValidationMetadata::default();

    for doc in docs {
        let line = doc.trim();
        if let Some(rest) = line.strip_prefix("@minimum ") {
            validation.minimum = parse_bound(rest);
        } else if let Some(rest) = line.strip_prefix("@maximum ") {
            validation.maximum = parse_bound(rest);
        } else if let Some(rest) = line.strip_prefix("@minLength ") {
            validation.min_length = parse_bound(rest);
        } else if let Some(rest) = line.strip_prefix("@maxLength ") {
            validation.max_length = parse_bound(rest);
        } else if let Some(rest) = line.strip_prefix("@pattern ") {
            let pattern = rest.trim();
            if !pattern.is_empty() {
                validation.pattern = Some(pattern.to_string());
            }
        } else if let Some(rest) = line.strip_prefix("@format ") {
            validation.format = parse_format(rest);
        }
    }

    apply_default_validation_messages(&mut validation);

    if validation.minimum.is_some()
        || validation.maximum.is_some()
        || validation.min_length.is_some()
        || validation.max_length.is_some()
        || validation.pattern.is_some()
        || validation.format.is_some()
    {
        Some(validation)
    } else {
        None
    }
}

fn apply_default_validation_messages(validation: &mut CandidValidationMetadata) {
    validation.minimum = with_default_bound_message(validation.minimum.take(), "minimum");
    validation.maximum = with_default_bound_message(validation.maximum.take(), "maximum");
    validation.min_length = with_default_bound_message(validation.min_length.take(), "minLength");
    validation.max_length = with_default_bound_message(validation.max_length.take(), "maxLength");
    validation.format = with_default_format_message(validation.format.take());
}

fn with_default_bound_message(
    bound: Option<CandidValidationBound>,
    kind: &str,
) -> Option<CandidValidationBound> {
    let mut bound = bound?;

    if bound.message.is_none() {
        bound.message = Some(default_bound_message(kind, &bound.value));
    }

    Some(bound)
}

fn with_default_format_message(
    format: Option<CandidValidationFormat>,
) -> Option<CandidValidationFormat> {
    let mut format = format?;

    if format.message.is_none() {
        format.message = default_format_message(&format.r#type);
    }

    Some(format)
}

fn default_bound_message(kind: &str, value: &str) -> String {
    let rules = default_bound_rules();
    let template = rules
        .get(kind)
        .map(|rule| rule.template.as_str())
        .unwrap_or(match kind {
            "minimum" => "Must be at least {value}",
            "maximum" => "Must be at most {value}",
            "minLength" => "Must be at least {value} character{plural}",
            "maxLength" => "Must be at most {value} character{plural}",
            _ => "{value}",
        });

    template
        .replace("{value}", value)
        .replace("{plural}", if value == "1" { "" } else { "s" })
}

#[derive(Debug, Deserialize, Clone)]
struct MetadataRule {
    #[serde(rename = "errorMessage")]
    error_message: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
struct ValidationBoundRule {
    template: String,
}

#[derive(Debug, Deserialize, Clone)]
struct MetadataRulesFile {
    #[serde(rename = "defaultValidationMessages")]
    default_validation_messages: HashMap<String, ValidationBoundRule>,
}

fn format_rules() -> HashMap<String, MetadataRule> {
    serde_json::from_str(include_str!("../../codegen/src/metadata-rules.json")).unwrap_or_default()
}

fn default_bound_rules() -> HashMap<String, ValidationBoundRule> {
    serde_json::from_str::<MetadataRulesFile>(include_str!("../../codegen/src/metadata-rules.json"))
        .map(|rules| rules.default_validation_messages)
        .unwrap_or_default()
}

fn default_format_message(format_type: &str) -> Option<String> {
    format_rules()
        .get(format_type)
        .and_then(|rule| rule.error_message.clone())
}

fn parse_bound(raw: &str) -> Option<CandidValidationBound> {
    let mut parts = raw.trim().splitn(2, char::is_whitespace);
    let value = parts.next()?.trim();
    if value.is_empty() {
        return None;
    }
    let message = parts
        .next()
        .map(str::trim)
        .filter(|message| !message.is_empty())
        .map(str::to_string);

    Some(CandidValidationBound {
        value: value.to_string(),
        message,
    })
}

fn parse_format(raw: &str) -> Option<CandidValidationFormat> {
    let mut parts = raw.trim().splitn(2, char::is_whitespace);
    let format_type = parts.next()?.trim();
    if format_type.is_empty() {
        return None;
    }
    let message = parts
        .next()
        .map(str::trim)
        .filter(|message| !message.is_empty())
        .map(str::to_string);

    Some(CandidValidationFormat {
        r#type: format_type.to_string(),
        message,
        regex: None,
        json_schema_format: None,
        content_encoding: None,
        error_message: None,
    })
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DidToCodOptions {
    #[serde(rename = "customJSDocFormatTypes", default)]
    pub(crate) custom_jsdoc_format_types: HashMap<String, CustomJSDocFormatDefinition>,
}

#[derive(Clone, Deserialize)]
#[serde(untagged)]
pub(crate) enum CustomJSDocFormatDefinition {
    Regex(String),
    Definition(CustomJSDocFormatDefinitionObject),
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CustomJSDocFormatDefinitionObject {
    pub(crate) regex: Option<String>,
    #[serde(rename = "jsonSchemaFormat")]
    pub(crate) json_schema_format: Option<String>,
    #[serde(rename = "contentEncoding")]
    pub(crate) content_encoding: Option<String>,
    #[serde(rename = "errorMessage")]
    pub(crate) error_message: Option<String>,
}

fn syntax_field_for<'a>(
    fields: Option<&'a [TypeField]>,
    label: &candid_parser::candid::types::Label,
) -> Option<&'a TypeField> {
    fields?.iter().find(|field| field.label == *label)
}

fn type_to_schema(
    ty: &candid_parser::candid::types::Type,
    syntax_ty: Option<&IDLType>,
) -> CandidType {
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
                    candid_parser::candid::types::Label::Id(id)
                        | candid_parser::candid::types::Label::Unnamed(id)
                        if id == idx as u32
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
                                .and_then(|field| metadata_from_docs(&field.docs)),
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
                                .and_then(|field| metadata_from_docs(&field.docs)),
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

fn type_bindings_by_name(ast: &IDLProg) -> HashMap<String, &Binding> {
    ast.decs
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

#[wasm_bindgen(js_name = parseDid)]
pub fn parse_did(prog: String) -> Result<JsValue, String> {
    let schema = parse_did_schema(&prog)?;
    serde_wasm_bindgen::to_value(&schema).map_err(|e| e.to_string())
}

#[wasm_bindgen(js_name = didToCod)]
pub fn did_to_cod(prog: String, options: JsValue) -> Result<String, String> {
    let options = if options.is_null() || options.is_undefined() {
        DidToCodOptions::default()
    } else {
        serde_wasm_bindgen::from_value(options).map_err(|e| e.to_string())?
    };
    let ast = prog.parse::<IDLProg>().map_err(|e| e.to_string())?;
    let mut env = TypeEnv::new();
    let actor = check_prog(&mut env, &ast).map_err(|e| e.to_string())?;
    let merged = IDLMergedProg::new(ast);

    Ok(cod::compile(&env, &actor, &merged, &options))
}

fn parse_did_schema(prog: &str) -> Result<CandidSchema, String> {
    let ast = prog.parse::<IDLProg>().map_err(|e| e.to_string())?;
    let mut env = TypeEnv::new();
    let actor = check_prog(&mut env, &ast).map_err(|e| e.to_string())?;
    let type_bindings = type_bindings_by_name(&ast);
    let method_bindings = service_method_bindings_from_actor(ast.actor.as_ref(), &type_bindings);

    let mut emitted_type_names = HashSet::new();
    let mut types = Vec::new();

    for dec in &ast.decs {
        if let Dec::TypD(binding) = dec {
            if let Some(ty) = env.0.get(&binding.id) {
                emitted_type_names.insert(binding.id.clone());
                types.push(CandidTypeDeclaration {
                    name: binding.id.clone(),
                    ty: type_to_schema(ty, Some(&binding.typ)),
                    metadata: metadata_from_docs(&binding.docs),
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
            metadata: binding.and_then(|binding| metadata_from_docs(&binding.docs)),
        });
    }

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
                        let binding = method_bindings
                            .iter()
                            .find(|binding| binding.id == *name)
                            .copied();
                        let syntax_func = syntax_func_for_method(binding);
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
                            args: func
                                .args
                                .iter()
                                .enumerate()
                                .map(|(index, arg)| {
                                    type_to_schema(
                                        arg,
                                        syntax_func.and_then(|func| func.args.get(index)),
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
                                        syntax_func.and_then(|func| func.rets.get(index)),
                                    )
                                })
                                .collect(),
                            metadata: binding.and_then(|binding| metadata_from_docs(&binding.docs)),
                        })
                    } else {
                        None
                    }
                })
                .collect();

            Some(CandidServiceDeclaration {
                methods,
                metadata: ast
                    .actor
                    .as_ref()
                    .and_then(|actor| metadata_from_docs(&actor.docs)),
            })
        } else {
            None
        }
    });

    Ok(CandidSchema { types, service })
}
