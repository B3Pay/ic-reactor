use candid_parser::syntax::IDLMergedProg;
use candid_parser::{check_prog, IDLProg, TypeEnv};
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
