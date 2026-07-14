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

fn type_to_json(ty: &candid_parser::candid::types::Type) -> String {
    use candid_parser::candid::types::TypeInner;
    match ty.as_ref() {
        TypeInner::Null => r#"{"kind":"null"}"#.to_string(),
        TypeInner::Bool => r#"{"kind":"bool"}"#.to_string(),
        TypeInner::Nat => r#"{"kind":"nat"}"#.to_string(),
        TypeInner::Int => r#"{"kind":"int"}"#.to_string(),
        TypeInner::Nat8 => r#"{"kind":"nat8"}"#.to_string(),
        TypeInner::Nat16 => r#"{"kind":"nat16"}"#.to_string(),
        TypeInner::Nat32 => r#"{"kind":"nat32"}"#.to_string(),
        TypeInner::Nat64 => r#"{"kind":"nat64"}"#.to_string(),
        TypeInner::Int8 => r#"{"kind":"int8"}"#.to_string(),
        TypeInner::Int16 => r#"{"kind":"int16"}"#.to_string(),
        TypeInner::Int32 => r#"{"kind":"int32"}"#.to_string(),
        TypeInner::Int64 => r#"{"kind":"int64"}"#.to_string(),
        TypeInner::Float32 => r#"{"kind":"float32"}"#.to_string(),
        TypeInner::Float64 => r#"{"kind":"float64"}"#.to_string(),
        TypeInner::Text => r#"{"kind":"text"}"#.to_string(),
        TypeInner::Reserved => r#"{"kind":"reserved"}"#.to_string(),
        TypeInner::Empty => r#"{"kind":"empty"}"#.to_string(),
        TypeInner::Principal => r#"{"kind":"principal"}"#.to_string(),
        TypeInner::Var(name) => format!(r#"{{"kind":"reference","name":"{}"}}"#, name),
        TypeInner::Opt(inner) => format!(r#"{{"kind":"opt","type":{}}}"#, type_to_json(inner)),
        TypeInner::Vec(inner) => {
            if let TypeInner::Nat8 = inner.as_ref() {
                r#"{"kind":"blob"}"#.to_string()
            } else {
                format!(r#"{{"kind":"vec","type":{}}}"#, type_to_json(inner))
            }
        }
        TypeInner::Record(fields) => {
            let is_tuple = fields.iter().enumerate().all(|(idx, field)| {
                match *field.id {
                    candid_parser::candid::types::Label::Id(id) | candid_parser::candid::types::Label::Unnamed(id) => id == idx as u32,
                    _ => false,
                }
            });

            if is_tuple && !fields.is_empty() {
                let types_json: Vec<String> = fields.iter().map(|f| type_to_json(&f.ty)).collect();
                format!(r#"{{"kind":"tuple","types":[{}]}}"#, types_json.join(","))
            } else {
                let fields_json: Vec<String> = fields.iter().map(|f| {
                    let label = match &*f.id {
                        candid_parser::candid::types::Label::Id(id)
                        | candid_parser::candid::types::Label::Unnamed(id) => {
                            format!("_{}_", id)
                        }
                        candid_parser::candid::types::Label::Named(name) => name.clone(),
                    };
                    format!(r#"{{"name":"{}","type":{}}}"#, label, type_to_json(&f.ty))
                }).collect();
                format!(r#"{{"kind":"record","fields":[{}]}}"#, fields_json.join(","))
            }
        }
        TypeInner::Variant(fields) => {
            let fields_json: Vec<String> = fields.iter().map(|f| {
                let label = match &*f.id {
                    candid_parser::candid::types::Label::Id(id)
                    | candid_parser::candid::types::Label::Unnamed(id) => {
                        format!("_{}_", id)
                    }
                    candid_parser::candid::types::Label::Named(name) => name.clone(),
                };
                format!(r#"{{"name":"{}","type":{}}}"#, label, type_to_json(&f.ty))
            }).collect();
            format!(r#"{{"kind":"variant","fields":[{}]}}"#, fields_json.join(","))
        }
        TypeInner::Func(_) => r#"{"kind":"func"}"#.to_string(),
        TypeInner::Service(_) => r#"{"kind":"service"}"#.to_string(),
        TypeInner::Class(_, _) => r#"{"kind":"class"}"#.to_string(),
        TypeInner::Unknown => r#"{"kind":"unknown"}"#.to_string(),
        TypeInner::Knot(_) => r#"{"kind":"knot"}"#.to_string(),
        TypeInner::Future => r#"{"kind":"future"}"#.to_string(),
    }
}

#[wasm_bindgen(js_name = parseDid)]
pub fn parse_did(prog: String) -> Result<String, String> {
    let ast = prog.parse::<IDLProg>().map_err(|e| e.to_string())?;
    let mut env = TypeEnv::new();
    let actor = check_prog(&mut env, &ast).map_err(|e| e.to_string())?;

    let mut types_json = Vec::new();
    // env.0 is the underlying BTreeMap
    for (name, ty) in env.0 {
        types_json.push(format!(
            r#"{{"name":"{}","type":{}}}"#,
            name, type_to_json(&ty)
        ));
    }

    let mut methods_json = Vec::new();
    if let Some(actor_ty) = actor {
        let service_ty = match actor_ty.as_ref() {
            candid_parser::candid::types::TypeInner::Class(_, inner) => inner.clone(),
            _ => actor_ty,
        };

        if let candid_parser::candid::types::TypeInner::Service(methods) = service_ty.as_ref() {
            for (name, ty) in methods {
                if let candid_parser::candid::types::TypeInner::Func(func) = ty.as_ref() {
                    let mode = if func.modes.contains(&candid_parser::candid::types::FuncMode::Oneway) {
                        "oneway"
                    } else if func.modes.contains(&candid_parser::candid::types::FuncMode::Query) {
                        "query"
                    } else {
                        "update"
                    };

                    let args_json: Vec<String> = func.args.iter().map(|t| type_to_json(t)).collect();
                    let rets_json: Vec<String> = func.rets.iter().map(|t| type_to_json(t)).collect();

                    methods_json.push(format!(
                        r#"{{"name":"{}","mode":"{}","args":[{}],"returns":[{}]}}"#,
                        name, mode, args_json.join(","), rets_json.join(",")
                    ));
                }
            }
        }
    }

    let service_str = if methods_json.is_empty() {
        "null".to_string()
    } else {
        format!(r#"{{"methods":[{}]}}"#, methods_json.join(","))
    };

    let result = format!(
        r#"{{"types":[{}],"service":{}}}"#,
        types_json.join(","), service_str
    );

    Ok(result)
}
