use anyhow::{anyhow, Context, Result};
use candid::{
    types::{Function, Type, TypeEnv, TypeInner},
    IDLArgs,
};
use candid_parser::{parse_idl_args, utils};
use serde::Serialize;

use crate::parse_candid_source;
use crate::{ir, CandidProgramIr};

#[derive(Debug)]
pub struct CandidProgram {
    env: TypeEnv,
    actor: Type,
    prog: candid_parser::syntax::IDLMergedProg,
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
        let actor = parsed
            .actor
            .ok_or_else(|| anyhow!("Candid source has no service actor"))?;

        Ok(Self {
            env: parsed.env,
            actor,
            prog: parsed.prog,
        })
    }

    pub fn summary(&self) -> Result<ProgramSummary> {
        let (init_args, service) = self.service_parts()?;
        let methods = self
            .env
            .as_service(&service)?
            .iter()
            .map(|(name, method)| {
                let func = self.env.as_func(method)?;
                Ok(MethodSummary {
                    name: name.clone(),
                    modes: func.modes.iter().map(|mode| format!("{mode:?}")).collect(),
                    args: func.args.iter().map(type_to_string).collect(),
                    returns: func.rets.iter().map(type_to_string).collect(),
                })
            })
            .collect::<Result<Vec<_>>>()?;

        Ok(ProgramSummary {
            service: type_to_string(&service),
            init_args: init_args.iter().map(type_to_string).collect(),
            methods,
        })
    }

    pub fn service_did(&self) -> Result<String> {
        Ok(
            utils::get_metadata(&self.env, &Some(self.actor.clone())).unwrap_or_else(|| {
                candid::pretty::candid::compile(&self.env, &Some(self.actor.clone()))
            }),
        )
    }

    pub fn ir(&self) -> Result<CandidProgramIr> {
        ir::program_ir(&self.env, &self.actor, &self.prog)
    }

    pub fn ir_json(&self) -> Result<String> {
        Ok(serde_json::to_string_pretty(&self.ir()?)?)
    }

    pub fn encode_method_args(&self, method: &str, args_text: &str) -> Result<Vec<u8>> {
        let func = self.method(method)?;
        self.encode_args_for_types(args_text, &func.args)
            .with_context(|| format!("failed to encode args for method `{method}`"))
    }

    pub fn decode_method_args(&self, method: &str, bytes: &[u8]) -> Result<String> {
        let func = self.method(method)?;
        self.decode_args_for_types(bytes, &func.args)
            .with_context(|| format!("failed to decode args for method `{method}`"))
    }

    pub fn decode_method_reply(&self, method: &str, bytes: &[u8]) -> Result<String> {
        let func = self.method(method)?;
        self.decode_args_for_types(bytes, &func.rets)
            .with_context(|| format!("failed to decode reply for method `{method}`"))
    }

    pub fn encode_init_args(&self, args_text: &str) -> Result<Vec<u8>> {
        let (init_args, _) = self.service_parts()?;
        self.encode_args_for_types(args_text, &init_args)
            .context("failed to encode init args")
    }

    pub fn decode_init_args(&self, bytes: &[u8]) -> Result<String> {
        let (init_args, _) = self.service_parts()?;
        self.decode_args_for_types(bytes, &init_args)
            .context("failed to decode init args")
    }

    pub fn encode_dynamic_args(args_text: &str) -> Result<Vec<u8>> {
        Ok(parse_idl_args(args_text)?.to_bytes()?)
    }

    pub fn decode_dynamic_args(bytes: &[u8]) -> Result<String> {
        Ok(IDLArgs::from_bytes(bytes)?.to_string())
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
        self.env
            .get_method(&self.actor, method)
            .cloned()
            .with_context(|| format!("method `{method}` not found"))
    }

    fn service_parts(&self) -> Result<(Vec<Type>, Type)> {
        let traced = self.env.trace_type(&self.actor)?;
        match traced.as_ref() {
            TypeInner::Class(args, service) => Ok((args.clone(), service.clone())),
            TypeInner::Service(_) => Ok((vec![], self.actor.clone())),
            other => Err(anyhow!("expected service or service class, got {other}")),
        }
    }
}

pub fn parse_summary_json(source: &str) -> Result<String> {
    let program = CandidProgram::from_source(source)?;
    Ok(serde_json::to_string_pretty(&program.summary()?)?)
}

fn type_to_string(ty: &Type) -> String {
    ty.to_string()
}

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
            .encode_args_for_types(
                r#"(variant { ok = 10 })"#,
                &program.method("save").unwrap().rets,
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
    fn summarizes_service_methods() {
        let summary = CandidProgram::from_source(DID).unwrap().summary().unwrap();

        assert_eq!(summary.methods.len(), 2);
        assert!(summary.methods.iter().any(|method| method.name == "lookup"));
        assert!(summary.methods.iter().any(|method| method.name == "save"));
    }
}
