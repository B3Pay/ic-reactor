/**
 * User-facing CLI failures.
 *
 * A command throws `CliError` for anything the user is expected to fix: a
 * missing config, a malformed field, an output path that escapes the project.
 * `runCli` catches it, prints the message and returns exit code 1.
 *
 * Commands deliberately do not call `process.exit` themselves. An exit in the
 * middle of a command skips the outro that tells the user the run failed, and it
 * is invisible to anything that calls the command as a function — which is how
 * this package is tested.
 */
export class CliError extends Error {
  override readonly name = "CliError"

  constructor(message: string) {
    super(message)
  }
}

/** The message of an unknown thrown value, without assuming it is an `Error`. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
