#!/usr/bin/env node
/**
 * @ic-reactor/cli
 *
 * CLI tool to generate type-safe React hooks for ICP canisters.
 */

import { runCli } from "./program.js"

process.exitCode = await runCli()
