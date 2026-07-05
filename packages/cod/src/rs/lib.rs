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
pub use generator::{generate_typescript, TypeScriptEmitter};
pub use ir::{
    CandidActorIr, CandidArgIr, CandidFieldIr, CandidFieldLabelIr, CandidMethodIr,
    CandidMethodModeIr, CandidServiceIr, CandidTypeDeclIr, CandidTypeIr, ProgramIr,
    PROGRAM_IR_VERSION,
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
    let program = ir::program_ir_from_parts(&parsed.env, parsed.actor.as_ref(), &parsed.prog)?;
    generate_typescript(&program, config)
}

pub fn generate_typescript_from_file(
    path: impl AsRef<Path>,
    config: &GeneratorConfig,
) -> Result<String> {
    let parsed = parse_candid_file(path)?;
    let program = ir::program_ir_from_parts(&parsed.env, parsed.actor.as_ref(), &parsed.prog)?;
    generate_typescript(&program, config)
}
