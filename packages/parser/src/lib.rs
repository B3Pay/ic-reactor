use candid::types::{Type, TypeEnv};
use candid_parser::syntax::IDLMergedProg;
#[cfg(feature = "nodejs-fs")]
use std::path::Path;
use wasm_bindgen::prelude::*;

mod checker;
mod cod;
#[cfg(feature = "nodejs-fs")]
mod fs;
mod metadata;
mod options;
mod schema;

use options::parse_did_to_cod_options;

#[wasm_bindgen(js_name = didToJs)]
pub fn did_to_js(prog: String) -> Result<String, String> {
    let (env, actor, _) = check_source(&prog)?;

    let res = candid_parser::bindings::javascript::compile(&env, &actor);

    Ok(res)
}

#[wasm_bindgen(js_name = didToJsFile)]
pub fn did_to_js_file(file: String) -> Result<String, String> {
    let (env, actor, _) = check_file(&file)?;
    Ok(candid_parser::bindings::javascript::compile(&env, &actor))
}

#[wasm_bindgen(js_name = didToTs)]
pub fn did_to_ts(prog: String) -> Result<String, String> {
    let (env, actor, merged) = check_source(&prog)?;
    let res = candid_parser::bindings::typescript::compile(&env, &actor, &merged);

    Ok(res)
}

#[wasm_bindgen(js_name = didToTsFile)]
pub fn did_to_ts_file(file: String) -> Result<String, String> {
    let (env, actor, merged) = check_file(&file)?;
    Ok(candid_parser::bindings::typescript::compile(
        &env, &actor, &merged,
    ))
}

#[wasm_bindgen(js_name = validateIDL)]
pub fn validate_idl(prog: String) -> Result<bool, String> {
    check_source(&prog)?;
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


#[wasm_bindgen(js_name = parseDid)]
pub fn parse_did(prog: String) -> Result<JsValue, String> {
    let schema = parse_did_schema(&prog)?;
    serde_wasm_bindgen::to_value(&schema).map_err(|e| e.to_string())
}

#[wasm_bindgen(js_name = parseDidFile)]
pub fn parse_did_file(file: String) -> Result<JsValue, String> {
    let schema = parse_did_file_schema(&file)?;
    serde_wasm_bindgen::to_value(&schema).map_err(|e| e.to_string())
}

#[wasm_bindgen(js_name = didToCod)]
pub fn did_to_cod(prog: String, options: JsValue) -> Result<String, String> {
    let options = parse_did_to_cod_options(options)?;
    let (env, actor, merged) = check_source(&prog)?;

    Ok(cod::compile(&env, &actor, &merged, &options))
}

#[wasm_bindgen(js_name = didToCodFile)]
pub fn did_to_cod_file(file: String, options: JsValue) -> Result<String, String> {
    let options = parse_did_to_cod_options(options)?;
    let (env, actor, merged) = check_file(&file)?;

    Ok(cod::compile(&env, &actor, &merged, &options))
}

fn check_source(prog: &str) -> Result<(TypeEnv, Option<Type>, IDLMergedProg), String> {
    checker::check_source("<inline candid>", prog).map_err(|e| e.to_string())
}

#[cfg(feature = "nodejs-fs")]
fn check_file(file: &str) -> Result<(TypeEnv, Option<Type>, IDLMergedProg), String> {
    checker::check_file(Path::new(file)).map_err(|e| e.to_string())
}

#[cfg(not(feature = "nodejs-fs"))]
fn check_file(_file: &str) -> Result<(TypeEnv, Option<Type>, IDLMergedProg), String> {
    Err("file-aware Candid parsing is only available in the nodejs parser build".to_string())
}

fn parse_did_schema(prog: &str) -> Result<schema::CandidSchema, String> {
    schema::parse_did_schema(prog)
}

fn parse_did_file_schema(file: &str) -> Result<schema::CandidSchema, String> {
    schema::parse_did_file_schema(file)
}
