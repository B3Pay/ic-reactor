//! Candid type checking and import resolution.
//!
//! Adapted from DFINITY's `icp-js-bindgen` parser implementation:
//! https://github.com/dfinity/icp-js-bindgen/blob/main/src/core/generate/rs/src/parser.rs
//! That implementation is Apache-2.0 licensed and is itself a port of
//! `candid_parser` typing logic with file import support.

use candid::types::{Field, Function, Type, TypeEnv, TypeInner};
use candid_parser::{
    pretty_parse,
    syntax::{
        Binding, Dec, IDLActorType, IDLArgType, IDLMergedProg, IDLProg, IDLType, PrimType,
        TypeField,
    },
    Error, Result,
};
use std::collections::BTreeSet;

#[cfg(feature = "nodejs-fs")]
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};

#[cfg(feature = "nodejs-fs")]
use crate::fs::read_file_utf8;

pub struct Env<'a> {
    pub te: &'a mut TypeEnv,
    pub pre: bool,
}

fn check_prim(prim: &PrimType) -> Type {
    match prim {
        PrimType::Nat => TypeInner::Nat,
        PrimType::Nat8 => TypeInner::Nat8,
        PrimType::Nat16 => TypeInner::Nat16,
        PrimType::Nat32 => TypeInner::Nat32,
        PrimType::Nat64 => TypeInner::Nat64,
        PrimType::Int => TypeInner::Int,
        PrimType::Int8 => TypeInner::Int8,
        PrimType::Int16 => TypeInner::Int16,
        PrimType::Int32 => TypeInner::Int32,
        PrimType::Int64 => TypeInner::Int64,
        PrimType::Float32 => TypeInner::Float32,
        PrimType::Float64 => TypeInner::Float64,
        PrimType::Bool => TypeInner::Bool,
        PrimType::Text => TypeInner::Text,
        PrimType::Null => TypeInner::Null,
        PrimType::Reserved => TypeInner::Reserved,
        PrimType::Empty => TypeInner::Empty,
    }
    .into()
}

pub fn check_type(env: &Env, t: &IDLType) -> Result<Type> {
    match t {
        IDLType::PrimT(prim) => Ok(check_prim(prim)),
        IDLType::VarT(id) => {
            let key = id.clone();
            env.te.find_type(&key)?;
            Ok(TypeInner::Var(key).into())
        }
        IDLType::OptT(t) => {
            let t = check_type(env, t)?;
            Ok(TypeInner::Opt(t).into())
        }
        IDLType::VecT(t) => {
            let t = check_type(env, t)?;
            Ok(TypeInner::Vec(t).into())
        }
        IDLType::RecordT(fs) => {
            let fs = check_fields(env, fs)?;
            Ok(TypeInner::Record(fs).into())
        }
        IDLType::VariantT(fs) => {
            let fs = check_fields(env, fs)?;
            Ok(TypeInner::Variant(fs).into())
        }
        IDLType::PrincipalT => Ok(TypeInner::Principal.into()),
        IDLType::FuncT(func) => {
            let mut args = Vec::new();
            for arg in func.args.iter() {
                args.push(check_arg(env, arg)?);
            }

            let mut rets = Vec::new();
            for ret in func.rets.iter() {
                rets.push(check_arg(env, ret)?);
            }

            if func.modes.len() > 1 {
                return Err(Error::msg("cannot have more than one mode"));
            }
            if func.modes.len() == 1
                && func.modes[0] == candid::types::FuncMode::Oneway
                && !rets.is_empty()
            {
                return Err(Error::msg("oneway function has non-unit return type"));
            }

            Ok(TypeInner::Func(Function {
                modes: func.modes.clone(),
                args,
                rets,
            })
            .into())
        }
        IDLType::ServT(ms) => {
            let methods = check_methods(env, ms)?;
            Ok(TypeInner::Service(methods).into())
        }
        IDLType::ClassT(_, _) => Err(Error::msg("service constructor not supported")),
    }
}

fn check_arg(env: &Env, arg: &IDLArgType) -> Result<Type> {
    check_type(env, &arg.typ)
}

fn check_fields(env: &Env, fields: &[TypeField]) -> Result<Vec<Field>> {
    let mut result = Vec::new();
    for field in fields.iter() {
        result.push(Field {
            id: field.label.clone().into(),
            ty: check_type(env, &field.typ)?,
        });
    }
    Ok(result)
}

fn check_methods(env: &Env, methods: &[Binding]) -> Result<Vec<(String, Type)>> {
    let mut result = Vec::new();
    for method in methods.iter() {
        let ty = check_type(env, &method.typ)?;
        if !env.pre && env.te.as_func(&ty).is_err() {
            return Err(Error::msg(format!(
                "method {} is a non-function type",
                method.id
            )));
        }
        result.push((method.id.to_owned(), ty));
    }
    Ok(result)
}

fn check_defs(env: &mut Env, declarations: &[Dec]) -> Result<()> {
    for declaration in declarations.iter() {
        match declaration {
            Dec::TypD(Binding { id, typ, docs: _ }) => {
                let ty = check_type(env, typ)?;
                env.te.0.insert(id.clone(), ty);
            }
            Dec::ImportType(_) | Dec::ImportServ(_) => {}
        }
    }
    Ok(())
}

fn check_cycle(env: &TypeEnv) -> Result<()> {
    fn has_cycle<'a>(seen: &mut BTreeSet<&'a str>, env: &'a TypeEnv, ty: &'a Type) -> Result<bool> {
        match ty.as_ref() {
            TypeInner::Var(id) => {
                if seen.insert(id.as_str()) {
                    let ty = env.find_type(id)?;
                    has_cycle(seen, env, ty)
                } else {
                    Ok(true)
                }
            }
            _ => Ok(false),
        }
    }

    for (id, ty) in env.0.iter() {
        let mut seen = BTreeSet::new();
        if has_cycle(&mut seen, env, ty)? {
            return Err(Error::msg(format!("{id} has cyclic type definition")));
        }
    }

    Ok(())
}

fn check_declarations(env: &mut Env, declarations: &[Dec]) -> Result<()> {
    for declaration in declarations.iter() {
        if let Dec::TypD(Binding { id, .. }) = declaration {
            let duplicate = env
                .te
                .0
                .insert(id.as_str().into(), TypeInner::Unknown.into());
            if duplicate.is_some() {
                return Err(Error::msg(format!("duplicate binding for {id}")));
            }
        }
    }

    env.pre = true;
    check_defs(env, declarations)?;
    check_cycle(env.te)?;
    env.pre = false;
    check_defs(env, declarations)?;

    Ok(())
}

fn check_actor(env: &Env, actor: &Option<IDLActorType>) -> Result<Option<Type>> {
    match actor.as_ref().map(|actor| &actor.typ) {
        None => Ok(None),
        Some(IDLType::ClassT(args, service)) => {
            let mut checked_args = Vec::new();
            for arg in args.iter() {
                checked_args.push(check_arg(env, arg)?);
            }
            let checked_service = check_type(env, service)?;
            env.te.as_service(&checked_service)?;
            Ok(Some(TypeInner::Class(checked_args, checked_service).into()))
        }
        Some(typ) => {
            let ty = check_type(env, typ)?;
            env.te.as_service(&ty)?;
            Ok(Some(ty))
        }
    }
}

pub fn check_merged_prog(
    merged_prog: IDLMergedProg,
) -> Result<(TypeEnv, Option<Type>, IDLMergedProg)> {
    let mut type_env = TypeEnv::new();
    let mut env = Env {
        te: &mut type_env,
        pre: false,
    };
    check_declarations(&mut env, &merged_prog.decs())?;
    let actor = check_actor(&env, &merged_prog.resolve_actor()?)?;
    Ok((type_env, actor, merged_prog))
}

pub fn check_source(name: &str, source: &str) -> Result<(TypeEnv, Option<Type>, IDLMergedProg)> {
    let prog = pretty_parse::<IDLProg>(name, source)?;
    check_merged_prog(IDLMergedProg::new(prog))
}

#[cfg(feature = "nodejs-fs")]
fn resolve_path(base: &Path, file: &str) -> PathBuf {
    let file = PathBuf::from(file);
    if file.is_absolute() {
        file
    } else {
        base.join(file)
    }
}

#[cfg(feature = "nodejs-fs")]
fn load_imports(
    base: &Path,
    visited: &mut BTreeMap<PathBuf, bool>,
    prog: &IDLProg,
    list: &mut Vec<(PathBuf, String, IDLProg)>,
) -> Result<()> {
    for declaration in prog.decs.iter() {
        let include_service = matches!(declaration, Dec::ImportServ(_));
        if let Dec::ImportType(file) | Dec::ImportServ(file) = declaration {
            let path = resolve_path(base, file);
            match visited.get_mut(&path) {
                Some(visited_include_service) => {
                    *visited_include_service = *visited_include_service || include_service;
                }
                None => {
                    visited.insert(path.clone(), include_service);
                    let code = read_file_utf8(&path)?;
                    let imported_prog = pretty_parse::<IDLProg>(path.to_str().unwrap(), &code)?;
                    let imported_base = path.parent().unwrap_or(base);
                    load_imports(imported_base, visited, &imported_prog, list)?;
                    list.push((path, file.to_string(), imported_prog));
                }
            }
        }
    }
    Ok(())
}

#[cfg(feature = "nodejs-fs")]
pub fn check_file(file: &Path) -> Result<(TypeEnv, Option<Type>, IDLMergedProg)> {
    let base = file
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    let code = read_file_utf8(file)?;
    let prog = pretty_parse::<IDLProg>(file.to_str().unwrap_or("<did file>"), &code)?;
    let mut visited = BTreeMap::new();
    let mut imports = Vec::new();
    load_imports(&base, &mut visited, &prog, &mut imports)?;

    let mut merged_prog = IDLMergedProg::new(prog);
    for (path, name, prog) in imports {
        let include_service = visited.get(&path).copied().unwrap_or(false);
        merged_prog.merge(include_service, name, prog)?;
    }

    check_merged_prog(merged_prog)
}
