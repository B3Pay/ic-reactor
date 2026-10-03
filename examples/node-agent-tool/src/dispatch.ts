// From a parsed command line to the command that runs it, with every failure
// reported the same way: src/failure.ts's kind switch and exit code.
import type { CommandLine } from "./command-line.ts"
import { balance } from "./commands/balance.ts"
import { info } from "./commands/info.ts"
import { transfer } from "./commands/transfer.ts"
import { watch } from "./commands/watch.ts"
import { whoami } from "./commands/whoami.ts"
import type { Context } from "./context.ts"
import { failureOf, reportFailure } from "./failure.ts"
import { intervalArg, UsageError } from "./input.ts"

/** A command line that names a command other than `demo`, which runs on a client of its own. */
export type ClientCommandLine = Extract<CommandLine, { help: false }>

/** Runs the command `line` names on `ctx`, and returns its exit code. */
export async function execute(
  line: ClientCommandLine,
  ctx: Context
): Promise<number> {
  try {
    return await dispatch(line, ctx)
  } catch (error) {
    return reportFailure(ctx.out, line.command, failureOf(error))
  }
}

function dispatch(line: ClientCommandLine, ctx: Context): Promise<number> {
  const { flags } = line
  const arg = (index: number): string => {
    const value = line.args[index]
    if (value === undefined)
      throw new UsageError(`${line.command} needs more arguments`)
    return value
  }
  switch (line.command) {
    case "whoami":
      return whoami(ctx)
    case "info":
      return info(ctx, { certified: flags.certified === true })
    case "balance":
      return balance(ctx, arg(0), {
        subaccount: flags.subaccount,
        certified: flags.certified === true,
      })
    case "transfer":
      return transfer(ctx, {
        to: arg(0),
        amount: arg(1),
        toSubaccount: flags["to-subaccount"],
        fromSubaccount: flags["from-subaccount"],
        memo: flags.memo,
        fee: flags.fee,
        createdAtTime: flags["created-at-time"],
        resendUnknown: flags["resend-unknown"] === true,
      })
    case "watch":
      return watch(ctx, arg(0), {
        subaccount: flags.subaccount,
        intervalMs:
          flags.interval === undefined ? 5_000 : intervalArg(flags.interval),
      })
    case "demo":
      throw new UsageError("demo runs on a client of its own")
    default: {
      const unhandled: never = line.command
      throw new UsageError(`unknown command ${String(unhandled)}`)
    }
  }
}
