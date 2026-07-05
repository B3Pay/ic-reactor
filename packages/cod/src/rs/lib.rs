pub mod config;
pub mod core;
pub mod docs;
pub mod generator;
pub mod ir;
#[cfg(feature = "wasm")]
pub mod wasm;

use std::path::Path;

use anyhow::{bail, Result};
use candid::types::{Type, TypeEnv};
use candid_parser::syntax::{Dec, IDLMergedProg, IDLProg};
use candid_parser::{check_file, check_prog};

pub use config::{CustomFormat, GeneratorConfig};
pub use core::{parse_summary_json, CandidProgram, MethodSummary, ProgramSummary};
pub use docs::{DocBlock, DocTag};
pub use generator::generate_typescript;
pub use ir::{
    CandidArgIr, CandidFieldIr, CandidMethodIr, CandidProgramIr, CandidServiceIr, CandidTypeDeclIr,
    CandidTypeIr,
};

#[derive(Debug)]
pub struct ParsedCandid {
    pub env: TypeEnv,
    pub actor: Option<Type>,
    pub prog: IDLMergedProg,
}

pub fn parse_candid_source(source: &str) -> Result<ParsedCandid> {
    let ast: IDLProg = source.parse()?;
    for dec in &ast.decs {
        match dec {
            Dec::ImportType(path) | Dec::ImportServ(path) => {
                bail!("Candid imports are not supported yet: {path}");
            }
            Dec::TypD(_) => {}
        }
    }
    let mut env = TypeEnv::new();
    let actor = check_prog(&mut env, &ast)?;
    let prog = IDLMergedProg::new(ast);

    Ok(ParsedCandid { env, actor, prog })
}

pub fn parse_candid_file(path: impl AsRef<Path>) -> Result<ParsedCandid> {
    let (env, actor, prog) = check_file(path.as_ref())?;
    Ok(ParsedCandid { env, actor, prog })
}

pub fn generate_typescript_from_source(source: &str, config: &GeneratorConfig) -> Result<String> {
    let parsed = parse_candid_source(source)?;
    generate_typescript(&parsed.env, &parsed.actor, &parsed.prog, config)
}

pub fn generate_typescript_from_file(
    path: impl AsRef<Path>,
    config: &GeneratorConfig,
) -> Result<String> {
    let parsed = parse_candid_file(path)?;
    generate_typescript(&parsed.env, &parsed.actor, &parsed.prog, config)
}
