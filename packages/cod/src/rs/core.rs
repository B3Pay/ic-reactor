use anyhow::{anyhow, Context, Result};
use candid_parser::candid::{
    types::{Function, Type, TypeEnv, TypeInner},
    IDLArgs,
};
use candid_parser::{parse_idl_args, utils};
use serde::Serialize;

use crate::parse_candid_source;
use crate::{
    ir, ArgIr, FieldIr, FieldLabelIr, MethodModeIr, ProgramIr, ProgramIrGraph, TypeId, TypeKindIr,
    TypeRefIr,
};

#[derive(Debug)]
pub struct CandidProgram {
    ir: ProgramIr,
    codec: CandidCodec,
}

#[derive(Debug)]
struct CandidCodec {
    env: TypeEnv,
    actor: Option<Type>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProgramSummary {
    pub service: String,
    pub init_args: Vec<String>,
    pub methods: Vec<MethodSummary>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MethodSummary {
    pub name: String,
    pub modes: Vec<String>,
    pub args: Vec<String>,
    pub returns: Vec<String>,
}

impl CandidProgram {
    pub fn from_source(source: &str) -> Result<Self> {
        let parsed = parse_candid_source(source)?;
        let ir = ir::program_ir_from_parts(&parsed.env, parsed.actor.as_ref(), &parsed.prog)?;

        Ok(Self {
            ir,
            codec: CandidCodec {
                env: parsed.env,
                actor: parsed.actor,
            },
        })
    }

    pub fn summary(&self) -> Result<ProgramSummary> {
        let graph = self.ir.graph()?;
        ProgramSummary::from_graph(&graph)
    }

    pub fn service_did(&self) -> Result<String> {
        self.codec.service_did()
    }

    pub fn ir(&self) -> &ProgramIr {
        &self.ir
    }

    pub fn ir_json(&self) -> Result<String> {
        Ok(serde_json::to_string_pretty(self.ir())?)
    }

    pub fn encode_method_args(&self, method: &str, args_text: &str) -> Result<Vec<u8>> {
        self.codec.encode_method_args(method, args_text)
    }

    pub fn decode_method_args(&self, method: &str, bytes: &[u8]) -> Result<String> {
        self.codec.decode_method_args(method, bytes)
    }

    pub fn decode_method_reply(&self, method: &str, bytes: &[u8]) -> Result<String> {
        self.codec.decode_method_reply(method, bytes)
    }

    pub fn encode_init_args(&self, args_text: &str) -> Result<Vec<u8>> {
        self.codec.encode_init_args(args_text)
    }

    pub fn decode_init_args(&self, bytes: &[u8]) -> Result<String> {
        self.codec.decode_init_args(bytes)
    }

    pub fn encode_dynamic_args(args_text: &str) -> Result<Vec<u8>> {
        Ok(parse_idl_args(args_text)?.to_bytes()?)
    }

    pub fn decode_dynamic_args(bytes: &[u8]) -> Result<String> {
        Ok(IDLArgs::from_bytes(bytes)?.to_string())
    }
}

impl ProgramSummary {
    pub fn from_graph(graph: &ProgramIrGraph<'_>) -> Result<Self> {
        let actor = graph
            .actor()
            .ok_or_else(|| anyhow!("Candid source has no service actor"))?;

        let methods = graph
            .service_methods(actor.service)?
            .into_iter()
            .map(|method| {
                Ok(MethodSummary {
                    name: method.name.clone(),
                    modes: method_summary_modes(method.mode),
                    args: candid_arg_type_texts(graph, &method.args)?,
                    returns: candid_arg_type_texts(graph, &method.returns)?,
                })
            })
            .collect::<Result<Vec<_>>>()?;

        Ok(Self {
            service: candid_type_text_id(graph, actor.service)?,
            init_args: candid_arg_type_texts(graph, &actor.init_args)?,
            methods,
        })
    }
}

impl CandidCodec {
    fn service_did(&self) -> Result<String> {
        let actor = self.require_actor()?;
        Ok(
            utils::get_metadata(&self.env, &Some(actor.clone())).unwrap_or_else(|| {
                candid_parser::candid::pretty::candid::compile(&self.env, &Some(actor.clone()))
            }),
        )
    }

    fn encode_method_args(&self, method: &str, args_text: &str) -> Result<Vec<u8>> {
        let func = self.method(method)?;
        self.encode_args_for_types(args_text, &func.args)
            .with_context(|| format!("failed to encode args for method `{method}`"))
    }

    fn decode_method_args(&self, method: &str, bytes: &[u8]) -> Result<String> {
        let func = self.method(method)?;
        self.decode_args_for_types(bytes, &func.args)
            .with_context(|| format!("failed to decode args for method `{method}`"))
    }

    fn decode_method_reply(&self, method: &str, bytes: &[u8]) -> Result<String> {
        let func = self.method(method)?;
        self.decode_args_for_types(bytes, &func.rets)
            .with_context(|| format!("failed to decode reply for method `{method}`"))
    }

    fn encode_init_args(&self, args_text: &str) -> Result<Vec<u8>> {
        let (init_args, _) = self.service_parts()?;
        self.encode_args_for_types(args_text, &init_args)
            .context("failed to encode init args")
    }

    fn decode_init_args(&self, bytes: &[u8]) -> Result<String> {
        let (init_args, _) = self.service_parts()?;
        self.decode_args_for_types(bytes, &init_args)
            .context("failed to decode init args")
    }

    fn encode_args_for_types(&self, args_text: &str, types: &[Type]) -> Result<Vec<u8>> {
        let parsed = parse_idl_args(args_text)?;
        let annotated = parsed.annotate_types(true, &self.env, types)?;
        Ok(annotated.to_bytes_with_types(&self.env, types)?)
    }

    fn decode_args_for_types(&self, bytes: &[u8], types: &[Type]) -> Result<String> {
        Ok(IDLArgs::from_bytes_with_types(bytes, &self.env, types)?.to_string())
    }

    fn method(&self, method: &str) -> Result<Function> {
        let actor = self.require_actor()?;
        self.env
            .get_method(actor, method)
            .cloned()
            .with_context(|| format!("method `{method}` not found"))
    }

    fn service_parts(&self) -> Result<(Vec<Type>, Type)> {
        let actor = self.require_actor()?;
        let traced = self.env.trace_type(actor)?;
        match traced.as_ref() {
            TypeInner::Class(args, service) => Ok((args.clone(), service.clone())),
            TypeInner::Service(_) => Ok((vec![], actor.clone())),
            other => Err(anyhow!("expected service or service class, got {other}")),
        }
    }

    fn require_actor(&self) -> Result<&Type> {
        self.actor
            .as_ref()
            .ok_or_else(|| anyhow!("Candid source has no service actor"))
    }
}

pub fn parse_summary_json(source: &str) -> Result<String> {
    let program = CandidProgram::from_source(source)?;
    Ok(serde_json::to_string_pretty(&program.summary()?)?)
}

fn candid_arg_type_texts(graph: &ProgramIrGraph<'_>, args: &[ArgIr]) -> Result<Vec<String>> {
    args.iter()
        .map(|arg| candid_type_text_ref(graph, arg.typ))
        .collect()
}

fn candid_type_text_ref(graph: &ProgramIrGraph<'_>, reference: TypeRefIr) -> Result<String> {
    match reference {
        TypeRefIr::Type { id } => candid_type_text_id(graph, id),
        TypeRefIr::Decl { id } => Ok(graph.declaration(id)?.name.clone()),
    }
}

fn candid_type_text_id(graph: &ProgramIrGraph<'_>, id: TypeId) -> Result<String> {
    Ok(match graph.type_kind(id)? {
        TypeKindIr::Null => "null".to_string(),
        TypeKindIr::Bool => "bool".to_string(),
        TypeKindIr::Nat => "nat".to_string(),
        TypeKindIr::Int => "int".to_string(),
        TypeKindIr::Nat8 => "nat8".to_string(),
        TypeKindIr::Nat16 => "nat16".to_string(),
        TypeKindIr::Nat32 => "nat32".to_string(),
        TypeKindIr::Nat64 => "nat64".to_string(),
        TypeKindIr::Int8 => "int8".to_string(),
        TypeKindIr::Int16 => "int16".to_string(),
        TypeKindIr::Int32 => "int32".to_string(),
        TypeKindIr::Int64 => "int64".to_string(),
        TypeKindIr::Float32 => "float32".to_string(),
        TypeKindIr::Float64 => "float64".to_string(),
        TypeKindIr::Text => "text".to_string(),
        TypeKindIr::Principal => "principal".to_string(),
        TypeKindIr::Reserved => "reserved".to_string(),
        TypeKindIr::Empty => "empty".to_string(),
        TypeKindIr::Opt { inner } => format!("opt {}", candid_type_text_ref(graph, *inner)?),
        TypeKindIr::Vec { inner } => format!("vec {}", candid_type_text_ref(graph, *inner)?),
        TypeKindIr::Record { fields } => format!(
            "record {{ {} }}",
            fields
                .iter()
                .map(|field| candid_field_text(graph, field, false))
                .collect::<Result<Vec<_>>>()?
                .join("; ")
        ),
        TypeKindIr::Variant { fields } => format!(
            "variant {{ {} }}",
            fields
                .iter()
                .map(|field| candid_field_text(graph, field, true))
                .collect::<Result<Vec<_>>>()?
                .join("; ")
        ),
        TypeKindIr::Func {
            args,
            returns,
            mode,
        } => format!(
            "func ({}) -> ({}){}",
            candid_arg_type_texts(graph, args)?.join(", "),
            candid_arg_type_texts(graph, returns)?.join(", "),
            method_mode_suffix(*mode)
        ),
        TypeKindIr::Service { methods } => format!(
            "service {{ {} }}",
            methods
                .iter()
                .map(|method_id| {
                    let method = graph.method(*method_id)?;
                    Ok(format!(
                        "{} : ({}) -> ({}){}",
                        candid_label(&method.name),
                        candid_arg_type_texts(graph, &method.args)?.join(", "),
                        candid_arg_type_texts(graph, &method.returns)?.join(", "),
                        method_mode_suffix(method.mode)
                    ))
                })
                .collect::<Result<Vec<_>>>()?
                .join("; ")
        ),
    })
}

fn candid_field_text(graph: &ProgramIrGraph<'_>, field: &FieldIr, variant: bool) -> Result<String> {
    let label = candid_field_label(&field.label);
    if variant && type_ref_is_direct_null(graph, field.typ)? {
        return Ok(label);
    }

    Ok(format!(
        "{} : {}",
        label,
        candid_type_text_ref(graph, field.typ)?
    ))
}

fn type_ref_is_direct_null(graph: &ProgramIrGraph<'_>, reference: TypeRefIr) -> Result<bool> {
    match reference {
        TypeRefIr::Type { id } => Ok(matches!(graph.type_kind(id)?, TypeKindIr::Null)),
        TypeRefIr::Decl { .. } => Ok(false),
    }
}

fn candid_field_label(label: &FieldLabelIr) -> String {
    match label {
        FieldLabelIr::Named { name } => candid_label(name),
        FieldLabelIr::Id { candid_id } | FieldLabelIr::Unnamed { candid_id } => {
            candid_id.to_string()
        }
    }
}

fn candid_label(name: &str) -> String {
    if is_candid_identifier(name) && !CANDID_KEYWORDS.contains(&name) {
        name.to_string()
    } else {
        serde_json::to_string(name).expect("serializing a string cannot fail")
    }
}

fn is_candid_identifier(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    (first.is_ascii_alphabetic() || first == '_')
        && chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
}

fn method_summary_modes(mode: MethodModeIr) -> Vec<String> {
    match mode {
        MethodModeIr::Query => vec!["query".to_string()],
        MethodModeIr::CompositeQuery => vec!["composite_query".to_string()],
        MethodModeIr::Update => vec![],
        MethodModeIr::Oneway => vec!["oneway".to_string()],
    }
}

fn method_mode_suffix(mode: MethodModeIr) -> &'static str {
    match mode {
        MethodModeIr::Query => " query",
        MethodModeIr::CompositeQuery => " composite_query",
        MethodModeIr::Update => "",
        MethodModeIr::Oneway => " oneway",
    }
}

const CANDID_KEYWORDS: &[&str] = &[
    "blob",
    "bool",
    "decimal",
    "empty",
    "float32",
    "float64",
    "func",
    "import",
    "int",
    "int8",
    "int16",
    "int32",
    "int64",
    "nat",
    "nat8",
    "nat16",
    "nat32",
    "nat64",
    "null",
    "opt",
    "principal",
    "query",
    "record",
    "reserved",
    "service",
    "text",
    "type",
    "variant",
    "vec",
];

#[cfg(test)]
mod tests {
    use super::*;

    const DID: &str = r#"
type Contact = record {
  email : text;
  age : nat8;
};

service : {
  save : (Contact) -> (variant { ok : nat; err : text });
  lookup : (principal) -> (opt Contact) query;
}
"#;

    #[test]
    fn encodes_and_decodes_method_args_with_types() {
        let program = CandidProgram::from_source(DID).unwrap();
        let bytes = program
            .encode_method_args(
                "save",
                r#"(record { email = "dev@example.com"; age = 42 })"#,
            )
            .unwrap();
        let decoded = program.decode_method_args("save", &bytes).unwrap();

        assert!(decoded.contains("dev@example.com"));
        assert!(decoded.contains("42 : nat8"));
    }

    #[test]
    fn decodes_method_replies_with_expected_return_types() {
        let program = CandidProgram::from_source(DID).unwrap();
        let reply = program
            .codec
            .encode_args_for_types(
                r#"(variant { ok = 10 })"#,
                &program.codec.method("save").unwrap().rets,
            )
            .unwrap();
        let decoded = program.decode_method_reply("save", &reply).unwrap();

        assert!(decoded.contains("variant"));
        assert!(decoded.contains("10 : nat"));
    }

    #[test]
    fn supports_dynamic_args_without_did() {
        let bytes = CandidProgram::encode_dynamic_args(r#"(42, "ic")"#).unwrap();
        let decoded = CandidProgram::decode_dynamic_args(&bytes).unwrap();

        assert!(decoded.contains("42"));
        assert!(decoded.contains("ic"));
    }

    #[test]
    fn ir_is_lowered_once_and_returned_by_reference() {
        let program = CandidProgram::from_source(DID).unwrap();
        let first = program.ir();
        let second = program.ir();

        assert!(std::ptr::eq(first, second));
        assert_eq!(
            serde_json::to_string_pretty(first).unwrap(),
            program.ir_json().unwrap()
        );
    }

    #[test]
    fn summarizes_service_methods() {
        let summary = CandidProgram::from_source(DID).unwrap().summary().unwrap();

        assert_eq!(summary.methods.len(), 2);
        assert!(summary.methods.iter().any(|method| method.name == "lookup"));
        assert!(summary.methods.iter().any(|method| method.name == "save"));
    }

    #[test]
    fn summary_consumes_program_ir_and_preserves_declaration_refs() {
        let summary = CandidProgram::from_source(DID).unwrap().summary().unwrap();
        let save = summary
            .methods
            .iter()
            .find(|method| method.name == "save")
            .unwrap();
        let lookup = summary
            .methods
            .iter()
            .find(|method| method.name == "lookup")
            .unwrap();

        assert_eq!(save.modes, Vec::<String>::new());
        assert_eq!(save.args, vec!["Contact"]);
        assert_eq!(save.returns, vec!["variant { ok : nat; err : text }"]);
        assert_eq!(lookup.modes, vec!["query"]);
        assert_eq!(lookup.returns, vec!["opt Contact"]);
    }

    #[test]
    fn summary_reports_service_class_init_args_and_modes_from_program_ir() {
        let summary = CandidProgram::from_source(
            r#"
type Config = record { owner : principal };

service : (Config, opt text) -> {
  read : () -> (text) query;
  stream : () -> (text) composite_query;
  write : (text) -> ();
  notify : (text) -> () oneway;
}
"#,
        )
        .unwrap()
        .summary()
        .unwrap();

        assert_eq!(summary.init_args, vec!["Config", "opt text"]);
        assert!(summary.service.contains("read : () -> (text) query"));
        assert_eq!(summary_method(&summary, "read").modes, vec!["query"]);
        assert_eq!(
            summary_method(&summary, "stream").modes,
            vec!["composite_query"]
        );
        assert_eq!(
            summary_method(&summary, "write").modes,
            Vec::<String>::new()
        );
        assert_eq!(summary_method(&summary, "notify").modes, vec!["oneway"]);
    }

    fn summary_method<'a>(summary: &'a ProgramSummary, name: &str) -> &'a MethodSummary {
        summary
            .methods
            .iter()
            .find(|method| method.name == name)
            .unwrap()
    }
}
