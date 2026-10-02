import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import {
  CborEncodeErrorCode,
  CertificateOutdatedErrorCode,
  CertifiedRejectErrorCode,
  CreateHttpAgentErrorCode,
  DerEncodeErrorCode,
  ExternalError,
  IdentityInvalidErrorCode,
  InvalidReadStateRequestErrorCode,
  MissingCanisterIdErrorCode,
  MissingFetchErrorCode,
  HttpErrorCode,
  HttpFetchErrorCode,
  IngressExpiryInvalidErrorCode,
  InputError,
  ProtocolError,
  RejectError,
  TimeoutWaitingForResponseErrorCode,
  TransportError,
  TrustError,
  UncertifiedRejectErrorCode,
  UncertifiedRejectUpdateErrorCode,
  UnexpectedErrorCode,
  UnknownError,
  type ReplicaRejectCode,
  type RequestId,
} from "@icp-sdk/core/agent"
import * as entry from "../src/index.js"
import {
  UPDATE_RESEND_DELAYS_MS,
  classifyError,
  createReactorError,
  invalidReplyError,
  isReactorError,
  retryQuery,
  retryUpdate,
  type CallMode,
  type ErrorContext,
  type ReactorErrorKind,
} from "../src/errors.js"

const LEDGER = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const MANAGEMENT = "aaaaa-aa"
const METHOD = "icrc1_transfer"
const REQUEST_ID = new Uint8Array(32).fill(7) as RequestId

// An update says whether the request may already be in the IC; unless a test
// is about that, it is not.
const context = (
  mode: CallMode,
  {
    canisterId = LEDGER,
    accepted,
    signal,
  }: { canisterId?: string; accepted?: boolean; signal?: AbortSignal } = {}
): ErrorContext =>
  mode === "update"
    ? { method: METHOD, canisterId, mode, accepted: accepted ?? false, signal }
    : { method: METHOD, canisterId, mode, accepted, signal }

// ---------------------------------------------------------------------------
// Two copies of every agent error. `real` is built with the SDK's own classes.
// `copy` is a plain object of the same shape, which is what another copy of
// `@icp-sdk/core` produces from the point of view of this one: no shared
// classes, no `instanceof`, only the properties.
// ---------------------------------------------------------------------------

interface Built {
  real: () => unknown
  copy: () => unknown
}

const foreign = (
  kind: string,
  code: Record<string, unknown>,
  message = "an error from another copy of the agent"
) => ({ name: `${kind}Error`, message, kind, code })

const certifiedReject = (rejectCode: number, message = "rejected"): Built => ({
  real: () =>
    RejectError.fromCode(
      new CertifiedRejectErrorCode(
        REQUEST_ID,
        rejectCode as ReplicaRejectCode,
        message,
        undefined
      )
    ),
  copy: () =>
    foreign("Reject", {
      name: "CertifiedRejectErrorCode",
      rejectCode,
      rejectMessage: message,
    }),
})

const http = (status: number, bodyText?: string): Built => ({
  real: () =>
    ProtocolError.fromCode(
      new HttpErrorCode(status, "Some Status", [], bodyText)
    ),
  copy: () =>
    foreign("Protocol", {
      name: "HttpErrorCode",
      status,
      statusText: "Some Status",
      bodyText,
    }),
})

const transport = (cause: unknown = new TypeError("fetch failed")): Built => ({
  real: () => TransportError.fromCode(new HttpFetchErrorCode(cause)),
  copy: () =>
    foreign("Transport", { name: "HttpFetchErrorCode", error: cause }),
})

const pollingTimeout: Built = {
  real: () =>
    ProtocolError.fromCode(
      new TimeoutWaitingForResponseErrorCode(
        "Request timed out after 300000 msec",
        REQUEST_ID
      )
    ),
  copy: () =>
    foreign("Protocol", {
      name: "TimeoutWaitingForResponseErrorCode",
      message: "Request timed out after 300000 msec",
    }),
}

const queryBackoffExhausted: Built = {
  real: () =>
    UnknownError.fromCode(
      new TimeoutWaitingForResponseErrorCode(
        "Backoff strategy exhausted after 3 attempts.",
        REQUEST_ID
      )
    ),
  copy: () =>
    foreign("Unknown", {
      name: "TimeoutWaitingForResponseErrorCode",
      message: "Backoff strategy exhausted after 3 attempts.",
    }),
}

const untrusted: Built = {
  real: () =>
    TrustError.fromCode(new CertificateOutdatedErrorCode(5, REQUEST_ID, 3)),
  copy: () => foreign("Trust", { name: "CertificateOutdatedErrorCode" }),
}

const ingressExpiry: Built = {
  real: () =>
    InputError.fromCode(
      new IngressExpiryInvalidErrorCode("ingress_expiry is in the past", 5)
    ),
  copy: () =>
    foreign("Input", {
      name: "IngressExpiryInvalidErrorCode",
      message: "ingress_expiry is in the past",
    }),
}

/** Errors the agent throws while it builds, encodes or signs a request. */
const preSend: [string, Built][] = [
  [
    "a request that cannot be CBOR-encoded",
    {
      real: () =>
        InputError.fromCode(new CborEncodeErrorCode(new Error("bad"), "x")),
      copy: () => foreign("Input", { name: "CborEncodeErrorCode" }),
    },
  ],
  [
    "a public key that cannot be DER-encoded",
    {
      real: () => InputError.fromCode(new DerEncodeErrorCode("too long")),
      copy: () => foreign("Input", { name: "DerEncodeErrorCode" }),
    },
  ],
  [
    "an identity that can no longer sign",
    {
      real: () => ExternalError.fromCode(new IdentityInvalidErrorCode()),
      copy: () => foreign("External", { name: "IdentityInvalidErrorCode" }),
    },
  ],
  [
    "no fetch to send with",
    {
      real: () => InputError.fromCode(new MissingFetchErrorCode()),
      copy: () => foreign("Input", { name: "MissingFetchErrorCode" }),
    },
  ],
  [
    "an agent that could not be built",
    {
      real: () => InputError.fromCode(new CreateHttpAgentErrorCode()),
      copy: () => foreign("Input", { name: "CreateHttpAgentErrorCode" }),
    },
  ],
  [
    "no canister id",
    {
      real: () =>
        InputError.fromCode(new MissingCanisterIdErrorCode(undefined)),
      copy: () => foreign("Input", { name: "MissingCanisterIdErrorCode" }),
    },
  ],
  [
    "a read_state request that could not be built",
    {
      real: () =>
        InputError.fromCode(new InvalidReadStateRequestErrorCode(undefined)),
      copy: () =>
        foreign("Input", { name: "InvalidReadStateRequestErrorCode" }),
    },
  ],
]

const unexpected: Built = {
  real: () => UnknownError.fromCode(new UnexpectedErrorCode("odd")),
  copy: () => foreign("Unknown", { name: "UnexpectedErrorCode" }),
}

const notAnAgentError: Built = {
  real: () => new TypeError("something else broke"),
  copy: () => ({ message: "something else broke" }),
}

// ---------------------------------------------------------------------------
// The table: one row per way the agent can fail. `retry` is the answer of the
// retry predicate that fits the mode: `retryUpdate(error, 0)` for an update,
// `retryQuery(0, error)` for a query.
// ---------------------------------------------------------------------------

interface Outcome {
  kind: ReactorErrorKind
  mayHaveExecuted: boolean
  retry: boolean
}

const settled = (
  kind: ReactorErrorKind,
  mayHaveExecuted: boolean,
  retry = false
): Outcome => ({ kind, mayHaveExecuted, retry })

/** A reply that never arrived: unknown on an update, "not delivered" on a query. */
const doubtful = {
  update: settled("outcome_unknown", true),
  query: settled("not_delivered", false, true),
}

interface Row {
  name: string
  built: Built
  canisterId?: string
  rejectCode?: number
  httpStatus?: number
  update: Outcome
  query: Outcome
}

const rows: Row[] = [
  // Reject codes from an ordinary canister.
  {
    name: "reject 1 (SYS_FATAL)",
    built: certifiedReject(1),
    rejectCode: 1,
    update: settled("rejected", false),
    query: settled("rejected", false),
  },
  {
    name: "reject 2 (SYS_TRANSIENT)",
    built: certifiedReject(2),
    rejectCode: 2,
    update: settled("not_delivered", false, true),
    query: settled("not_delivered", false, true),
  },
  {
    name: "reject 3 (DESTINATION_INVALID)",
    built: certifiedReject(3),
    rejectCode: 3,
    update: settled("rejected", false),
    query: settled("rejected", false),
  },
  {
    name: "reject 4 (CANISTER_REJECT)",
    built: certifiedReject(4),
    rejectCode: 4,
    update: settled("rejected", true),
    query: settled("rejected", false),
  },
  {
    name: "reject 5 (CANISTER_ERROR)",
    built: certifiedReject(5),
    rejectCode: 5,
    update: settled("rejected", true),
    query: settled("rejected", false),
  },
  {
    name: "reject 6 (SYS_UNKNOWN)",
    built: certifiedReject(6),
    rejectCode: 6,
    ...doubtful,
  },
  {
    name: "a reject code the spec does not list",
    built: certifiedReject(99),
    rejectCode: 99,
    ...doubtful,
  },
  {
    name: "a rejection whose code cannot be read",
    built: {
      real: () =>
        RejectError.fromCode(
          new CertifiedRejectErrorCode(
            REQUEST_ID,
            undefined as unknown as ReplicaRejectCode,
            "rejected",
            undefined
          )
        ),
      copy: () => foreign("Reject", { name: "CertifiedRejectErrorCode" }),
    },
    ...doubtful,
  },
  // The management canister: 1, 2 and 3 do not prove that nothing ran.
  ...[1, 2, 3].map((code): Row => ({
    name: `reject ${code} from the management canister`,
    built: certifiedReject(code),
    canisterId: MANAGEMENT,
    rejectCode: code,
    update: settled("rejected", true),
    query: settled("rejected", false),
  })),
  ...[4, 5].map((code): Row => ({
    name: `reject ${code} from the management canister`,
    built: certifiedReject(code),
    canisterId: MANAGEMENT,
    rejectCode: code,
    update: settled("rejected", true),
    query: settled("rejected", false),
  })),
  {
    name: "reject 6 from the management canister",
    built: certifiedReject(6),
    canisterId: MANAGEMENT,
    rejectCode: 6,
    ...doubtful,
  },
  // HTTP answers.
  ...[400, 401, 403, 404, 413].map((status): Row => ({
    name: `HTTP ${status}`,
    built: http(status, "refused"),
    httpStatus: status,
    update: settled("not_delivered", false),
    query: settled("not_delivered", false),
  })),
  {
    name: "HTTP 429",
    built: http(429, "Too Many Requests"),
    httpStatus: 429,
    update: settled("not_delivered", false, true),
    query: settled("not_delivered", false, true),
  },
  {
    name: "HTTP 408",
    built: http(408),
    httpStatus: 408,
    ...doubtful,
  },
  ...[500, 502, 503, 504].map((status): Row => ({
    name: `HTTP ${status}`,
    built: http(status),
    httpStatus: status,
    ...doubtful,
  })),
  {
    name: "IngressExpiryInvalid",
    built: ingressExpiry,
    update: settled("not_delivered", false),
    query: settled("not_delivered", false),
  },
  // The agent failed before it sent anything: never delivered, and the same
  // input fails the same way again, so never retried.
  ...preSend.map(([name, built]): Row => ({
    name,
    built,
    update: settled("not_delivered", false),
    query: settled("not_delivered", false),
  })),
  // No answer, or one that cannot be trusted.
  { name: "a network failure", built: transport(), ...doubtful },
  { name: "a polling timeout", built: pollingTimeout, ...doubtful },
  {
    name: "an exhausted query backoff",
    built: queryBackoffExhausted,
    ...doubtful,
  },
  { name: "a Trust failure", built: untrusted, ...doubtful },
  { name: "an unexpected agent error", built: unexpected, ...doubtful },
  // Something that is not an agent error at all: never retried.
  {
    name: "an error that is not from the agent",
    built: notAnAgentError,
    update: settled("outcome_unknown", true),
    query: settled("not_delivered", false),
  },
]

describe("classifyError", () => {
  beforeEach(() => {
    // `retryQuery` never retries on a server, which is what Node is.
    vi.stubGlobal("window", {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe.each(rows)("$name", (row) => {
    for (const [label, build] of [
      ["an SDK error", row.built.real],
      ["a plain object of the same shape", row.built.copy],
    ] as const) {
      for (const mode of ["update", "query"] as const) {
        const want = row[mode]
        it(`${label}, ${mode}: ${want.kind}, mayHaveExecuted ${want.mayHaveExecuted}`, () => {
          const thrown = build()
          const canisterId = row.canisterId ?? LEDGER
          const error = classifyError(thrown, context(mode, { canisterId }))

          expect(isReactorError(error)).toBe(true)
          expect(error.kind).toBe(want.kind)
          expect(error.mayHaveExecuted).toBe(want.mayHaveExecuted)
          expect(error.rejectCode).toBe(row.rejectCode)
          expect(error.httpStatus).toBe(row.httpStatus)
          expect(error.method).toBe(METHOD)
          expect(error.canisterId).toBe(canisterId)
          expect(error.cause).toBe(thrown)
          expect(error.name).toBe("ReactorError")
          expect(error).toBeInstanceOf(Error)
          expect(error.message).toMatch(
            new RegExp(`^\\[ic-reactor\\] ${METHOD} on ${canisterId}: .+`)
          )
          expect(error.message).not.toContain("\n")

          const retried =
            mode === "update" ? retryUpdate(error, 0) : retryQuery(0, error)
          expect(retried).toBe(want.retry)
        })
      }
    }
  })

  describe("what each reject code proves about an update on an ordinary canister", () => {
    it.each([
      [1, false],
      [2, false],
      [3, false],
      [4, true],
      [5, true],
    ])("reject code %i: mayHaveExecuted %s", (code, mayHaveExecuted) => {
      const error = classifyError(
        certifiedReject(code).real(),
        context("update")
      )
      expect(error.mayHaveExecuted).toBe(mayHaveExecuted)
    })
  })

  it("reads a reject code from the replica's three reject error codes alike", () => {
    const classes = [
      new CertifiedRejectErrorCode(
        REQUEST_ID,
        4 as ReplicaRejectCode,
        "m",
        undefined
      ),
      new UncertifiedRejectErrorCode(
        REQUEST_ID,
        4 as ReplicaRejectCode,
        "m",
        undefined,
        undefined
      ),
      new UncertifiedRejectUpdateErrorCode(
        REQUEST_ID,
        4 as ReplicaRejectCode,
        "m",
        undefined
      ),
    ]
    for (const code of classes) {
      const error = classifyError(RejectError.fromCode(code), context("update"))
      expect(error.kind).toBe("rejected")
      expect(error.rejectCode).toBe(4)
      expect(error.mayHaveExecuted).toBe(true)
    }
  })

  it("reads a reject code that sits on the error itself", () => {
    const flat = { kind: "Reject", rejectCode: 3, message: "bad destination" }
    const error = classifyError(flat, context("update"))
    expect(error.kind).toBe("rejected")
    expect(error.rejectCode).toBe(3)
    expect(error.mayHaveExecuted).toBe(false)
  })

  it("ignores a status on a code that is not an HttpErrorCode", () => {
    // Only the agent's HTTP error code says the answer was an HTTP refusal.
    const odd = foreign("Protocol", { name: "SomethingElse", status: 400 })
    const error = classifyError(odd, context("update"))
    expect(error.kind).toBe("outcome_unknown")
    expect(error.mayHaveExecuted).toBe(true)
    expect(error.httpStatus).toBeUndefined()
  })

  describe("a string or a primitive thrown by something else", () => {
    it.each(["boom", 42, null, undefined])("%s", (thrown) => {
      const update = classifyError(thrown, context("update"))
      expect(update.kind).toBe("outcome_unknown")
      expect(update.mayHaveExecuted).toBe(true)
      const query = classifyError(thrown, context("query"))
      expect(query.kind).toBe("not_delivered")
      expect(query.mayHaveExecuted).toBe(false)
    })
  })

  describe("an error that is already a ReactorError", () => {
    it("comes back as the same object, whatever the context", () => {
      const refusal = createReactorError("unauthenticated", {
        method: METHOD,
        canisterId: LEDGER,
      })
      const returned = classifyError(refusal, context("update"))
      expect(returned).toBe(refusal)
      expect(classifyError(refusal, context("query"))).toBe(refusal)
    })

    it("keeps the `Err` payload of a canister_err", () => {
      const err = { InsufficientFunds: { balance: 5n } }
      const failure = createReactorError("canister_err", {
        method: METHOD,
        canisterId: LEDGER,
        err,
      })
      const returned = classifyError(failure, context("update"))
      expect(returned).toBe(failure)
      expect(returned.kind).toBe("canister_err")
    })

    it("recognises one that carries only the brand, as a second copy's would", () => {
      const secondCopy = Object.assign(new Error("from elsewhere"), {
        [Symbol.for("ic-reactor.ReactorError")]: true,
        kind: "rejected",
        mayHaveExecuted: true,
      })
      expect(classifyError(secondCopy, context("query"))).toBe(secondCopy)
    })
  })

  describe("a call that was cancelled", () => {
    const abort = () =>
      new DOMException("The operation was aborted.", "AbortError")

    it("reads an AbortError as cancelled", () => {
      const error = classifyError(abort(), context("query"))
      expect(error.kind).toBe("cancelled")
      expect(error.mayHaveExecuted).toBe(false)
      expect(error.cause).toBeInstanceOf(DOMException)
    })

    it("reads an abort wrapped by the agent's fetch error as cancelled", () => {
      for (const build of [transport(abort()).real, transport(abort()).copy]) {
        const error = classifyError(build(), context("query"))
        expect(error.kind).toBe("cancelled")
        expect(retryQuery(0, error)).toBe(false)
      }
    })

    it("reads an aborted signal as cancelled, whatever the agent said", () => {
      const controller = new AbortController()
      controller.abort()
      const error = classifyError(
        transport().real(),
        context("query", { signal: controller.signal })
      )
      expect(error.kind).toBe("cancelled")
      expect(error.mayHaveExecuted).toBe(false)
    })

    it("does not read a live signal as cancelled", () => {
      const controller = new AbortController()
      const error = classifyError(
        transport().real(),
        context("query", { signal: controller.signal })
      )
      expect(error.kind).toBe("not_delivered")
    })

    it("keeps an aborted update open: the request may already have been sent", () => {
      const error = classifyError(abort(), context("update"))
      expect(error.kind).toBe("cancelled")
      expect(error.mayHaveExecuted).toBe(true)
    })
  })

  describe("an update the replica may already have accepted", () => {
    // The agent polls `read_state` after a 202. An HTTP error from that poll,
    // or a refused ingress expiry, says nothing about the update itself,
    // which is in the IC by then. The same holds when the agent re-sent the
    // request on its own: it reports only the last attempt's status, so a 429
    // at the end of a sequence that began with a lost connection proves
    // nothing about the first attempt. The client passes `accepted: true` for
    // both.
    it.each([
      ["HTTP 429", http(429)],
      ["HTTP 400", http(400)],
      ["HTTP 403", http(403)],
      ["IngressExpiryInvalid", ingressExpiry],
      ...preSend,
    ])("%s is outcome_unknown, and is not re-sent", (_name, built) => {
      for (const build of [built.real, built.copy]) {
        const error = classifyError(
          build(),
          context("update", { accepted: true })
        )
        expect(error.kind).toBe("outcome_unknown")
        expect(error.mayHaveExecuted).toBe(true)
        expect(retryUpdate(error, 0)).toBe(false)
      }
    })

    it("reads a context that leaves `accepted` out as accepted", () => {
      // The type requires it; a caller that gets round the type, or is not
      // TypeScript, must get the answer that cannot cause a double send.
      const unspecified = {
        method: METHOD,
        canisterId: LEDGER,
        mode: "update",
      } as unknown as ErrorContext
      for (const built of [http(429), http(400), ingressExpiry]) {
        for (const build of [built.real, built.copy]) {
          const error = classifyError(build(), unspecified)
          expect(error.kind).toBe("outcome_unknown")
          expect(error.mayHaveExecuted).toBe(true)
          expect(retryUpdate(error, 0)).toBe(false)
        }
      }
    })

    it("leaves a reject code to mean what it always means", () => {
      const error = classifyError(
        certifiedReject(2).real(),
        context("update", { accepted: true })
      )
      expect(error.kind).toBe("not_delivered")
      expect(error.mayHaveExecuted).toBe(false)
    })

    it("does not change a query", () => {
      const error = classifyError(
        http(429).real(),
        context("query", { accepted: true })
      )
      expect(error.kind).toBe("not_delivered")
    })
  })

  describe("a canister that does not exist", () => {
    // The agent reports it as an HTTP 400 whose message carries the body,
    // the headers and the whole request context.
    const body = [
      "error: canister_not_found",
      `details: Canister ${LEDGER} not found`,
      ...Array.from(
        { length: 80 },
        (_, i) => `trace line ${i}: ${"x".repeat(60)}`
      ),
    ].join("\n")
    const thrown = ProtocolError.fromCode(
      new HttpErrorCode(
        400,
        "Bad Request",
        [
          ["content-type", "text/plain; charset=utf-8"],
          ["x-request-id", "0".repeat(36)],
        ],
        body
      )
    )

    it("is not delivered, and has not executed", () => {
      const update = classifyError(thrown, context("update"))
      expect(update.kind).toBe("not_delivered")
      expect(update.mayHaveExecuted).toBe(false)
      expect(update.httpStatus).toBe(400)
      expect(retryUpdate(update, 0)).toBe(false)
    })

    it("keeps its own message short and readable, and the original as the cause", () => {
      expect(thrown.message.length).toBeGreaterThan(2000)
      const error = classifyError(thrown, context("update"))
      expect(error.message.length).toBeLessThan(300)
      expect(error.message).toContain(`[ic-reactor] ${METHOD} on ${LEDGER}: `)
      expect(error.message).toContain("HTTP 400")
      expect(error.message).toContain("canister_not_found")
      expect(error.cause).toBe(thrown)
    })
  })
})

describe("createReactorError", () => {
  it.each(["invalid_args", "unauthenticated", "cancelled"] as const)(
    "%s never says mayHaveExecuted",
    (kind) => {
      const error = createReactorError(kind, {
        method: METHOD,
        canisterId: LEDGER,
      })
      expect(error.kind).toBe(kind)
      expect(error.mayHaveExecuted).toBe(false)
      expect(error.err).toBeUndefined()
      expect("err" in error).toBe(false)
      expect(retryQuery(0, error)).toBe(false)
      expect(retryUpdate(error, 0)).toBe(false)
    }
  )

  it("carries a code, a reason and the issues", () => {
    const issues = [{ code: "type", path: "to", message: "not a principal" }]
    const error = createReactorError("invalid_args", {
      method: METHOD,
      canisterId: "$unresolved:ledger",
      code: "canister_id_unresolved",
      reason: "no canister is named ledger in the environment",
      issues,
    })
    expect(error.code).toBe("canister_id_unresolved")
    expect(error.issues).toEqual(issues)
    expect(error.message).toBe(
      `[ic-reactor] ${METHOD} on $unresolved:ledger: no canister is named ledger in the environment`
    )
  })

  it("carries the Err payload of a canister_err, and has not executed", () => {
    const err = { InsufficientFunds: { balance: 5n } }
    const error = createReactorError("canister_err", {
      method: METHOD,
      canisterId: LEDGER,
      err,
    })
    expect(error.kind).toBe("canister_err")
    expect(error.err).toBe(err)
    expect(error.mayHaveExecuted).toBe(false)
  })

  it("says mayHaveExecuted for an invalid_reply on an update, not on a query", () => {
    const update = createReactorError("invalid_reply", {
      method: METHOD,
      canisterId: LEDGER,
      mode: "update",
    })
    const query = createReactorError("invalid_reply", {
      method: METHOD,
      canisterId: LEDGER,
      mode: "query",
    })
    expect(update.kind).toBe("invalid_reply")
    expect(update.mayHaveExecuted).toBe(true)
    expect(query.kind).toBe("invalid_reply")
    expect(query.mayHaveExecuted).toBe(false)
  })

  it("has a helper for an invalid_reply that reads the mode from the call context", () => {
    const cause = new RangeError("bad nat")
    const issues = [{ code: "range", path: "0.amount", message: "bad nat" }]
    const update = invalidReplyError(context("update"), { cause, issues })
    expect(update.kind).toBe("invalid_reply")
    expect(update.mayHaveExecuted).toBe(true)
    expect(update.cause).toBe(cause)
    expect(update.issues).toEqual(issues)
    expect(invalidReplyError(context("query")).mayHaveExecuted).toBe(false)
  })

  it("is an Error named ReactorError, with the cause not enumerable", () => {
    const cause = new Error("inner")
    const error = createReactorError("invalid_args", {
      method: METHOD,
      canisterId: LEDGER,
      cause,
    })
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe("ReactorError")
    expect(String(error.stack)).toContain("ReactorError")
    expect(error.cause).toBe(cause)
    expect(Object.keys(error)).not.toContain("cause")
  })
})

describe("retryUpdate", () => {
  const retryable = () =>
    classifyError(certifiedReject(2).real(), context("update"))

  it("sends an update again at most twice, 300 ms and then 600 ms later", () => {
    expect(UPDATE_RESEND_DELAYS_MS).toEqual([300, 600])
    const error = retryable()
    expect(retryUpdate(error, 0)).toBe(true)
    expect(retryUpdate(error, 1)).toBe(true)
    expect(retryUpdate(error, 2)).toBe(false)
    expect(retryUpdate(error, 3)).toBe(false)
  })

  it("retries an HTTP 429", () => {
    const error = classifyError(http(429).real(), context("update"))
    expect(retryUpdate(error, 0)).toBe(true)
  })

  it.each([
    ["reject 2 from the management canister", certifiedReject(2), MANAGEMENT],
    ["reject 1", certifiedReject(1), LEDGER],
    ["reject 4", certifiedReject(4), LEDGER],
    ["reject 6", certifiedReject(6), LEDGER],
    ["HTTP 400", http(400), LEDGER],
    ["HTTP 408", http(408), LEDGER],
    ["HTTP 503", http(503), LEDGER],
    ["a network failure", transport(), LEDGER],
    ["a polling timeout", pollingTimeout, LEDGER],
    ["IngressExpiryInvalid", ingressExpiry, LEDGER],
  ])("does not retry %s", (_name, built, canisterId) => {
    const error = classifyError(built.real(), context("update", { canisterId }))
    expect(retryUpdate(error, 0)).toBe(false)
  })

  it("does not retry what is only safe to send again for a query", () => {
    // A failure classified as a query's is marked retryable (nothing ran, or
    // nothing that matters), but it says nothing about an update: only reject
    // 2 and HTTP 429 prove the request was never accepted.
    vi.stubGlobal("window", {})
    try {
      for (const built of [
        certifiedReject(6),
        http(408),
        http(503),
        transport(),
        pollingTimeout,
        untrusted,
      ]) {
        const asQuery = classifyError(built.real(), context("query"))
        expect(retryQuery(0, asQuery)).toBe(true)
        expect(retryUpdate(asQuery, 0)).toBe(false)
      }
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("does not retry anything that is not a classified failure", () => {
    expect(retryUpdate(new Error("boom"), 0)).toBe(false)
    expect(retryUpdate(undefined, 0)).toBe(false)
    expect(retryUpdate(certifiedReject(2).real(), 0)).toBe(false)
  })
})

describe("retryQuery", () => {
  const retryable = () => classifyError(transport().real(), context("query"))

  describe("in a browser", () => {
    beforeEach(() => {
      vi.stubGlobal("window", {})
    })
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it("retries three times and then stops", () => {
      const error = retryable()
      expect(retryQuery(0, error)).toBe(true)
      expect(retryQuery(1, error)).toBe(true)
      expect(retryQuery(2, error)).toBe(true)
      expect(retryQuery(3, error)).toBe(false)
    })

    it("retries only a not_delivered the classifier marked retryable", () => {
      const query = (built: Built, canisterId = LEDGER) =>
        classifyError(built.real(), context("query", { canisterId }))
      expect(retryQuery(0, query(certifiedReject(2)))).toBe(true)
      expect(retryQuery(0, query(http(429)))).toBe(true)
      expect(retryQuery(0, query(http(503)))).toBe(true)
      expect(retryQuery(0, query(certifiedReject(6)))).toBe(true)
      expect(retryQuery(0, query(certifiedReject(5)))).toBe(false)
      expect(retryQuery(0, query(certifiedReject(2), MANAGEMENT))).toBe(false)
      expect(retryQuery(0, query(http(400)))).toBe(false)
      expect(retryQuery(0, query(http(403)))).toBe(false)
      expect(retryQuery(0, query(ingressExpiry))).toBe(false)
      expect(retryQuery(0, query(notAnAgentError))).toBe(false)
    })

    it("does not retry a failure of the client's own", () => {
      for (const kind of [
        "invalid_args",
        "unauthenticated",
        "cancelled",
      ] as const) {
        const error = createReactorError(kind, {
          method: METHOD,
          canisterId: LEDGER,
        })
        expect(retryQuery(0, error)).toBe(false)
      }
      expect(retryQuery(0, new Error("boom"))).toBe(false)
    })
  })

  it("does not retry at all on a server", () => {
    // TanStack defaults to no retries on a server; supplying a predicate
    // overrides that, so a failed prefetch would pick up 1s/2s/4s of backoff.
    expect(typeof window).toBe("undefined")
    expect(retryQuery(0, retryable())).toBe(false)
  })

  it("does not retry under Deno, which TanStack counts as a server even with a window", () => {
    vi.stubGlobal("window", {})
    vi.stubGlobal("Deno", {})
    try {
      expect(retryQuery(0, retryable())).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe("isReactorError", () => {
  it("accepts what this module creates", () => {
    expect(
      isReactorError(
        createReactorError("invalid_args", {
          method: METHOD,
          canisterId: LEDGER,
        })
      )
    ).toBe(true)
    expect(
      isReactorError(classifyError(new Error("x"), context("update")))
    ).toBe(true)
  })

  it("rejects a plain Error and everything that is not a ReactorError", () => {
    expect(isReactorError(new Error("x"))).toBe(false)
    expect(isReactorError(new TypeError("x"))).toBe(false)
    expect(isReactorError(null)).toBe(false)
    expect(isReactorError(undefined)).toBe(false)
    expect(isReactorError("ReactorError")).toBe(false)
    expect(isReactorError(42)).toBe(false)
    expect(isReactorError({})).toBe(false)
  })

  it("does not accept an object that only looks like one", () => {
    // The name and the fields are not what decides.
    const lookalike = Object.assign(new Error("x"), {
      name: "ReactorError",
      kind: "rejected",
      mayHaveExecuted: true,
      method: METHOD,
      canisterId: LEDGER,
    })
    expect(isReactorError(lookalike)).toBe(false)
  })

  it("accepts an error that carries the brand, as a second copy's errors do", () => {
    const secondCopy = Object.assign(new Error("x"), {
      [Symbol.for("ic-reactor.ReactorError")]: true,
    })
    expect(isReactorError(secondCopy)).toBe(true)
    expect(
      isReactorError({ [Symbol.for("ic-reactor.ReactorError")]: true })
    ).toBe(true)
  })

  describe("across two copies of the module", () => {
    // `vi.resetModules()` makes the next import evaluate the module again,
    // which gives this test a second, independent copy, as a second bundle
    // would.
    let other: typeof import("../src/errors.js")

    beforeAll(async () => {
      vi.resetModules()
      other = await import("../src/errors.js")
    })

    beforeEach(() => {
      vi.stubGlobal("window", {})
    })
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it("really are looking at two copies", () => {
      expect(other.classifyError).not.toBe(classifyError)
    })

    it("recognises an error the other copy made, and the other way round", () => {
      const fromOther = other.classifyError(
        transport().real(),
        context("query")
      )
      const fromThis = classifyError(transport().real(), context("query"))
      expect(isReactorError(fromOther)).toBe(true)
      expect(other.isReactorError(fromThis)).toBe(true)
      expect(fromOther).not.toBeInstanceOf(fromThis.constructor)
    })

    it("hands the other copy's error back as it is", () => {
      const fromOther = other.createReactorError("unauthenticated", {
        method: METHOD,
        canisterId: LEDGER,
      })
      expect(classifyError(fromOther, context("update"))).toBe(fromOther)
    })

    it("retries what the other copy marked retryable", () => {
      const query = other.classifyError(transport().real(), context("query"))
      expect(retryQuery(0, query)).toBe(true)
      const update = other.classifyError(
        certifiedReject(2).real(),
        context("update")
      )
      expect(retryUpdate(update, 0)).toBe(true)
    })
  })
})

describe("the package entry", () => {
  it("exports isReactorError and keeps the classifier internal", () => {
    expect(entry.isReactorError).toBeTypeOf("function")
    for (const internal of [
      "classifyError",
      "createReactorError",
      "invalidReplyError",
      "retryQuery",
      "retryUpdate",
      "UPDATE_RESEND_DELAYS_MS",
      "ReactorFailure",
    ]) {
      expect(entry).not.toHaveProperty(internal)
    }
  })

  it("exports the same guard as the module", () => {
    expect(entry.isReactorError).toBe(isReactorError)
  })
})
