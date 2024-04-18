use candid_parser::{check_prog, IDLProg, TypeEnv};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn did_to_js(prog: String) -> Option<String> {
    let ast = prog.parse::<IDLProg>().ok()?;
    let mut env = TypeEnv::new();
    let actor = check_prog(&mut env, &ast).ok()?;
    let res = candid_parser::bindings::javascript::compile(&env, &actor);
    Some(res)
}
