use std::path::PathBuf;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use cod::{generate_typescript_from_file, GeneratorConfig};

#[derive(Debug, Parser)]
#[command(name = "cod")]
#[command(about = "Generate cod Candid schemas and TypeScript types from Candid .did files.")]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,

    /// Input .did file. Used as a generate shortcut when no subcommand is provided.
    input: Option<PathBuf>,

    /// Output TypeScript file. Prints to stdout when omitted.
    #[arg(short, long)]
    output: Option<PathBuf>,

    /// JSON config file with options such as customJSDocFormatTypes.
    #[arg(short, long)]
    config: Option<PathBuf>,

    /// Canister name used for the generated service export.
    #[arg(long)]
    canister_name: Option<String>,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Generate TypeScript and cod Candid schemas from a Candid file.
    Generate {
        /// Input .did file.
        input: PathBuf,

        /// Output TypeScript file. Prints to stdout when omitted.
        #[arg(short, long)]
        output: Option<PathBuf>,

        /// JSON config file with options such as customJSDocFormatTypes.
        #[arg(short, long)]
        config: Option<PathBuf>,

        /// Canister name used for the generated service export.
        #[arg(long)]
        canister_name: Option<String>,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    let (input, output, config_path, canister_name) = match cli.command {
        Some(Command::Generate {
            input,
            output,
            config,
            canister_name,
        }) => (input, output, config, canister_name),
        None => {
            let input = cli
                .input
                .context("missing input .did file; use `cod generate <input.did>`")?;
            (input, cli.output, cli.config, cli.canister_name)
        }
    };

    let mut config = match config_path {
        Some(path) => GeneratorConfig::from_path(path)?,
        None => GeneratorConfig::default(),
    };
    if let Some(canister_name) = canister_name {
        config.canister_name = canister_name;
    }

    let generated = generate_typescript_from_file(&input, &config)
        .with_context(|| format!("failed to generate TypeScript from {}", input.display()))?;

    match output {
        Some(path) => std::fs::write(&path, generated)
            .with_context(|| format!("failed to write {}", path.display()))?,
        None => print!("{generated}"),
    }

    Ok(())
}
