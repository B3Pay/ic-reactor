use candid_parser::{check_prog, IDLProg, TypeEnv};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn did_to_js(prog: String) -> Result<String, String> {
    let ast = prog.parse::<IDLProg>().map_err(|e| e.to_string())?;
    let mut env = TypeEnv::new();
    let actor = check_prog(&mut env, &ast).map_err(|e| e.to_string())?;

    let res = candid_parser::bindings::javascript::compile(&env, &actor);

    Ok(res)
}

#[wasm_bindgen]
pub fn did_to_ts(prog: String) -> Result<String, String> {
    let ast = prog.parse::<IDLProg>().map_err(|e| e.to_string())?;
    let mut env = TypeEnv::new();
    let actor = check_prog(&mut env, &ast).map_err(|e| e.to_string())?;

    let res = candid_parser::bindings::typescript::compile(&env, &actor);

    Ok(res)
}
