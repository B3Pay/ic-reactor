// Scenario 8, `demo`: every way a transfer can end, narrated, with no network
// and no funds.
//
// It runs this CLI's own commands (src/dispatch.ts) on a real client from
// `createTestClient()` (@ic-reactor/core/testing): the client signs each call,
// sends it through its agent to an in-memory replica that checks the
// signature, and verifies the certified reply, as it does on mainnet. Only the ledger is a
// mock (src/mock-ledger.ts). Before a step the demo arms one failure on the
// replica or the ledger; after it, it reads the replica's request log to show
// what the library did, and checks that the step ended as it should. Any
// surprise makes the demo exit 1, so `pnpm demo` is also a smoke test.
import { principal, type Principal } from "@candid-core/schema"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { createTestClient } from "@ic-reactor/core/testing"
import { parseCommandLine } from "../command-line.ts"
import type { Context } from "../context.ts"
import { execute } from "../dispatch.ts"
import { EXIT_CODES } from "../failure.ts"
import type { Caller } from "../identity.ts"
import { LEDGERS, ledgerFrom } from "../ledgers.ts"
import { createMockLedger } from "../mock-ledger.ts"
import {
  stringify,
  type FailureDoc,
  type Output,
  type SuccessDoc,
} from "../output.ts"

type Doc = SuccessDoc | FailureDoc

/** What one step of the demo saw. */
interface Seen {
  readonly exitCode: number
  readonly docs: readonly Doc[]
  /** The query and call requests the replica received, as `call icrc1_transfer`. */
  readonly replica: readonly string[]
  /** What it printed. */
  readonly lines: readonly string[]
}

interface Step {
  readonly title: string
  /** Arms a failure before the command runs. */
  readonly arm?: () => unknown
  /** The command lines to run, after `node src/cli.ts`. */
  readonly runs: () => readonly (readonly string[])[]
  /** The exit code of each run. */
  readonly expect: readonly number[]
  /** A problem with what was seen, beyond the exit code; `undefined` if none. */
  readonly check?: (seen: readonly Seen[]) => string | undefined
  /** What the library did, and why. */
  readonly why: string
}

/** Two fixed keys, so the principals are the same on every run. */
const SENDER = Ed25519KeyIdentity.fromSecretKey(new Uint8Array(32).fill(1))
const RECIPIENT: Principal = principal(
  Ed25519KeyIdentity.fromSecretKey(new Uint8Array(32).fill(2))
    .getPrincipal()
    .toText()
)

const DEMO_CALLER: Caller = {
  identity: SENDER,
  algorithm: "ed25519",
  source: "the demo's fixed Ed25519 key, signed in on createTestClient()",
  flags: [],
}

export async function demo(out: Output): Promise<number> {
  const test = createTestClient({ identity: SENDER })
  const ledger = createMockLedger({
    id: LEDGERS.icp,
    balances: [[principal(SENDER.getPrincipal().toText()), 1_000_000_000n]],
  })
  ledger.mountOn(test)

  out.note(
    [
      "node-agent-tool demo: how a transfer ends, every way, on an in-memory replica.",
      "The client is real (createTestClient() from @ic-reactor/core/testing): it signs each call,",
      "sends it to a replica in this process that checks the signature, and verifies the",
      "certified reply. Only the ICRC-1 ledger is a mock. Nothing leaves this process.",
    ].join("\n")
  )

  let resend: readonly string[] = []
  const to = RECIPIENT
  const steps: Step[] = [
    {
      title: "Who calls",
      runs: () => [["whoami"]],
      expect: [EXIT_CODES.ok],
      why: 'The client was built with an Identity, so every call is signed by it and the replica checks the signature. A client built with identity: "anonymous" only reads.',
    },
    {
      title: "A transfer",
      runs: () => [["transfer", to, "1.5"]],
      expect: [EXIT_CODES.ok],
      check: ([seen]) =>
        expectDoc(seen, (doc) => doc.ok && doc.outcome === "sent", "sent"),
      why: "The amount went through parseUnits at the ledger's 8 decimals, the fee is the ledger's own, and created_at_time is set. Four reads ran in parallel, then one call.",
    },
    {
      title: "The ledger says no",
      runs: () => [["transfer", to, "1000"]],
      expect: [EXIT_CODES.canister_err],
      check: ([seen]) =>
        expectDoc(
          seen,
          (doc) =>
            !doc.ok && doc.kind === "canister_err" && !doc.mayHaveExecuted,
          "a canister_err that did not execute"
        ),
      why: "The ledger ran the call and answered Err. The client unwrapped it into a ReactorError of kind canister_err, with the ledger's TransferError in err: the outcome is known, so mayHaveExecuted is false.",
    },
    {
      title: "The reply is lost",
      arm: () => test.dropNextReply(),
      runs: () => [["transfer", to, "2"]],
      expect: [EXIT_CODES.outcome_unknown],
      check: ([seen]) => {
        const doc = seen?.docs[0]
        const argv = doc?.resend
        if (Array.isArray(argv) && argv.every((a) => typeof a === "string")) {
          resend = argv
        }
        return doc?.kind === "outcome_unknown" &&
          doc.mayHaveExecuted === true &&
          resend.length > 0
          ? undefined
          : "expected outcome_unknown, may have executed, and a re-send command"
      },
      why: "The ledger ran the transfer, but its reply never arrived: kind outcome_unknown, mayHaveExecuted true. The client did not send it again, since that could pay twice. The tool read the balance back and printed the command that re-sends the same argument.",
    },
    {
      title: "The same transfer, sent again",
      runs: () => [resend],
      expect: [EXIT_CODES.ok],
      check: ([seen]) =>
        expectDoc(
          seen,
          (doc) => doc.ok && doc.outcome === "duplicate",
          "a Duplicate answer"
        ),
      why: "Same sender, same argument, same created_at_time: the ledger knew the transfer and answered Duplicate { duplicate_of }. The first attempt had gone through, and nothing moved twice.",
    },
    {
      title: "Lost again, with --resend-unknown",
      arm: () => test.dropNextReply(),
      runs: () => [["transfer", to, "0.5", "--resend-unknown"]],
      expect: [EXIT_CODES.ok],
      check: ([seen]) =>
        expectDoc(
          seen,
          (doc) => doc.ok && doc.outcome === "duplicate" && doc.resent === true,
          "a re-send answered by Duplicate"
        ),
      why: "The same check in one command: after the lost reply the tool sent the same argument once more, and the ledger's Duplicate answer proved that the first attempt had gone through.",
    },
    {
      title: "Throttled once (HTTP 429)",
      arm: () => ledger.throttleNextTransfer(),
      runs: () => [["transfer", to, "0.25"]],
      expect: [EXIT_CODES.ok],
      check: ([seen]) => {
        const calls = seen?.replica.filter((r) => r.startsWith("call")) ?? []
        return calls.length === 2 && calls[0]?.includes("refused")
          ? undefined
          : `expected a refused call and a call that ran, saw ${JSON.stringify(calls)}`
      },
      why: "A 429 proves the call never got in, so the client sent it again by itself, once, after 300 ms: the replica saw the refused call and the one that ran. It is the only re-send the client makes, and never after a failure that proves nothing.",
    },
    {
      title: "The canister rejects (reject code 4)",
      arm: () => ledger.rejectNextTransfer(4),
      runs: () => [["transfer", to, "0.25"]],
      expect: [EXIT_CODES.rejected],
      check: ([seen]) =>
        expectDoc(
          seen,
          (doc) =>
            !doc.ok &&
            doc.kind === "rejected" &&
            doc.rejectCode === 4 &&
            doc.mayHaveExecuted,
          "rejected with code 4, may have executed"
        ),
      why: "Reject code 4 comes from the canister, which may have changed state before it rejected: mayHaveExecuted is true. The balance read back is unchanged, and the tool still offers the safe re-send rather than guess.",
    },
    {
      title: "Nobody signed in",
      arm: () => test.auth.signOut(),
      runs: () => [["transfer", to, "0.25"]],
      expect: [EXIT_CODES.unauthenticated],
      check: ([seen]) =>
        seen?.replica.some((r) => r.startsWith("call"))
          ? "a call reached the replica"
          : undefined,
      why: "The client calls anonymously now, so it refused the write itself, before encoding or sending it: the replica saw the reads and no call.",
    },
    {
      title: "Input that cannot be sent",
      arm: () => test.auth.signIn(),
      runs: () => [
        ["transfer", "not-a-principal", "1"],
        ["transfer", to, "0.000000001"],
        ["transfer", to, "1", "--created-at-time", String(2n ** 64n)],
      ],
      expect: [EXIT_CODES.usage, EXIT_CODES.usage, EXIT_CODES.invalid_args],
      check: (seen) =>
        seen.some((s) => s.replica.some((r) => r.startsWith("call")))
          ? "a call reached the replica"
          : undefined,
      why: "The tool refused the first two before asking anything: principal(text) and parseUnits threw. The third passed its checks, but created_at_time is a nat64 and 2^64 does not fit: the client refused to encode it (invalid_args), and no call left.",
    },
  ]

  const problems: string[] = []
  try {
    for (const [index, step] of steps.entries()) {
      await step.arm?.()
      const runs = step.runs()
      const seen: Seen[] = []
      for (const argv of runs) seen.push(await runOne(argv, out))
      const exitCodes = seen.map((s) => s.exitCode)
      const problem =
        exitCodes.join() !== step.expect.join()
          ? `exit codes ${exitCodes.join(", ")}, expected ${step.expect.join(", ")}`
          : step.check?.(seen)
      if (problem !== undefined) problems.push(`step ${index + 1}: ${problem}`)

      if (out.json) {
        out.result(
          {
            ok: true,
            command: "demo",
            step: index + 1,
            title: step.title,
            runs: runs.map((argv, i) => ({
              argv: [...argv],
              exitCode: seen[i]?.exitCode ?? null,
              output: [...(seen[i]?.docs ?? [])],
              replica: [...(seen[i]?.replica ?? [])],
            })),
            expected: [...step.expect],
            asExpected: problem === undefined,
            why: step.why,
          },
          []
        )
      } else {
        out.note(`\n[${index + 1}/${steps.length}] ${step.title}`)
        for (const [i, argv] of runs.entries()) {
          const s = seen[i]
          if (s === undefined) continue
          out.note(`  $ node src/cli.ts ${argv.join(" ")}`)
          for (const line of s.lines) out.note(`  | ${line}`)
          out.note(
            `  exit ${s.exitCode} · the replica saw: ${s.replica.length === 0 ? "nothing" : s.replica.join(", ")}`
          )
        }
        out.note(
          `  ${problem === undefined ? "" : `NOT AS EXPECTED (${problem}). `}${step.why}`
        )
      }
    }
  } finally {
    // A client is disposed by whoever built it.
    test.client.dispose()
  }

  if (problems.length > 0) {
    out.failure(
      {
        ok: false,
        command: "demo",
        kind: "unexpected",
        mayHaveExecuted: false,
        message: problems.join("; "),
      },
      [
        "",
        `demo: ${problems.length} step(s) did not end as expected:`,
        ...problems,
      ]
    )
    return EXIT_CODES.unexpected
  }
  out.result({ ok: true, command: "demo", steps: steps.length }, [
    "",
    `demo: all ${steps.length} steps ended as expected.`,
  ])
  return EXIT_CODES.ok

  /** Runs one command line on the demo's client, capturing what it prints. */
  async function runOne(
    argv: readonly string[],
    parent: Output
  ): Promise<Seen> {
    const docs: Doc[] = []
    const lines: string[] = []
    const capture: Output = {
      json: parent.json,
      result(doc, human) {
        docs.push(doc)
        lines.push(...(parent.json ? [stringify(doc)] : human))
      },
      failure(doc, human) {
        docs.push(doc)
        lines.push(...(parent.json ? [stringify(doc)] : human))
      },
      note(line) {
        if (!parent.json) lines.push(line)
      },
    }
    const start = test.requests.length
    const line = parseCommandLine(argv)
    const exitCode = line.help
      ? EXIT_CODES.usage
      : await execute(line, contextFor(line.flags.ledger, capture))
    const replica = test.requests
      .slice(start)
      .filter((r) => r.endpoint === "query" || r.endpoint === "call")
      .map(
        (r) =>
          `${r.endpoint} ${r.methodName ?? "?"}${r.refused === undefined ? "" : ` (refused: ${r.refused})`}${r.dropped ? " (reply lost)" : ""}`
      )
    return { exitCode, docs, replica, lines }
  }

  function contextFor(ledgerFlag: string | undefined, output: Output): Context {
    return {
      client: test.client,
      caller: DEMO_CALLER,
      network: {
        network: { host: test.client.network },
        rootKey: "the in-memory replica's own",
        flags: [],
      },
      ledger: ledgerFrom(ledgerFlag),
      out: output,
      now: () => BigInt(Date.now()) * 1_000_000n,
      onInterrupt: () => () => {},
    }
  }
}

/** A problem unless the first document of `seen` passes `test`. */
function expectDoc(
  seen: Seen | undefined,
  test: (doc: Doc) => boolean,
  what: string
): string | undefined {
  const doc = seen?.docs[0]
  return doc !== undefined && test(doc)
    ? undefined
    : `expected ${what}, got ${doc === undefined ? "nothing" : stringify(doc)}`
}
