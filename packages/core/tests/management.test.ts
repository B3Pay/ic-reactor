/**
 * Calls to the management canister (`aaaaa-aa`): each is routed by the
 * effective canister id its method's row of the table names (D22, DECISIONS
 * Q13), as the fake replica's request log shows, and a call the table cannot
 * route is refused before anything is sent.
 *
 * The interface is the real one: `fixtures/management.did` is `ic.did` from
 * dfinity/portal.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  principal,
  resolveSchema,
  serviceMethods,
  type AnyFieldSchema,
} from "@candid-core/schema"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { EFFECTIVE_ID_FIELD } from "../src/management.js"
import {
  LEDGER,
  MANAGEMENT,
  SHAPES,
  canisterRequests,
  clientAs,
  replicaWith,
  serve,
} from "./canister-helpers.js"
import * as management from "./fixtures/management.js"

afterEach(() => {
  vi.unstubAllGlobals()
})

const controller = Ed25519KeyIdentity.generate()
const TARGET = principal(SHAPES)
const STORE = principal(LEDGER)
const CREATED = principal("bkyz2-fmaaa-aaaaa-qaaaq-cai")

function setup() {
  const replica = replicaWith({
    [MANAGEMENT]: serve<management.Actor>(management.actor, {
      start_canister: () => undefined,
      fetch_canister_logs: () => ({ canister_log_records: [] }),
      install_chunked_code: () => undefined,
      provisional_create_canister_with_cycles: ([arg]) => ({
        canister_id: arg.specified_id ?? CREATED,
      }),
    }),
  })
  const ic = clientAs(replica, controller).canister<management.Actor>(
    management.actor,
    { id: MANAGEMENT }
  )
  return { replica, ic }
}

describe("the effective canister id of a management call", () => {
  it("is the canister_id of the argument, for an update", async () => {
    const { replica, ic } = setup()
    await expect(
      ic.start_canister({ canister_id: TARGET })
    ).resolves.toBeUndefined()
    expect(canisterRequests(replica)).toMatchObject([
      {
        endpoint: "call",
        canisterId: MANAGEMENT,
        effectiveCanisterId: TARGET,
        methodName: "start_canister",
      },
    ])
  })

  it("is the canister_id of the argument, for a query", async () => {
    const { replica, ic } = setup()
    await expect(
      ic.fetch_canister_logs({ canister_id: TARGET })
    ).resolves.toEqual({ canister_log_records: [] })
    expect(canisterRequests(replica)).toMatchObject([
      {
        endpoint: "query",
        canisterId: MANAGEMENT,
        effectiveCanisterId: TARGET,
      },
    ])
  })

  it("is the target_canister of install_chunked_code, not its store_canister", async () => {
    const { replica, ic } = setup()
    await ic.install_chunked_code({
      mode: { tag: "install" },
      target_canister: TARGET,
      store_canister: STORE,
      chunk_hashes_list: [],
      wasm_module_hash: new Uint8Array(32),
      arg: new Uint8Array(),
      sender_canister_version: null,
    })
    expect(canisterRequests(replica)).toMatchObject([
      { canisterId: MANAGEMENT, effectiveCanisterId: TARGET },
    ])
  })

  it("is the specified_id of provisional_create_canister_with_cycles", async () => {
    const { replica, ic } = setup()
    await expect(
      ic.provisional_create_canister_with_cycles({
        amount: null,
        settings: null,
        specified_id: CREATED,
        sender_canister_version: null,
      })
    ).resolves.toEqual({ canister_id: CREATED })
    expect(canisterRequests(replica)).toMatchObject([
      { canisterId: MANAGEMENT, effectiveCanisterId: CREATED },
    ])
  })

  it("cannot be chosen for provisional_create_canister_with_cycles without specified_id: refused, nothing sent", async () => {
    const { replica, ic } = setup()
    const error = await ic
      .provisional_create_canister_with_cycles({
        amount: null,
        settings: null,
        specified_id: null,
        sender_canister_version: null,
      })
      .catch((e: unknown) => e)
    expect(error).toMatchObject({
      kind: "invalid_args",
      code: "effective_canister_id_unknown",
      mayHaveExecuted: false,
    })
    expect((error as Error).message).toContain("specified_id")
    expect(replica.requests).toEqual([])
  })

  it("is refused, before anything is sent, for every method the table has no row for", async () => {
    const { replica, ic } = setup()
    const unrouted = [...serviceMethods(management.actor).keys()].filter(
      (method) => !(method in EFFECTIVE_ID_FIELD)
    )
    // The canister-only methods and the two that take any principal.
    expect(unrouted.sort()).toEqual(
      [
        "bitcoin_get_balance",
        "bitcoin_get_block_headers",
        "bitcoin_get_current_fee_percentiles",
        "bitcoin_get_utxos",
        "bitcoin_send_transaction",
        "canister_info",
        "canister_metadata",
        "create_canister",
        "deposit_cycles",
        "ecdsa_public_key",
        "http_request",
        "list_canisters",
        "node_metrics_history",
        "raw_rand",
        "schnorr_public_key",
        "sign_with_ecdsa",
        "sign_with_schnorr",
        "subnet_info",
        "vetkd_derive_key",
        "vetkd_public_key",
      ].sort()
    )
    for (const method of unrouted) {
      const call = (ic as unknown as Record<string, () => Promise<unknown>>)[
        method
      ]
      await expect(call()).rejects.toMatchObject({
        kind: "invalid_args",
        code: "effective_canister_id_unknown",
        canisterId: MANAGEMENT,
        method,
      })
    }
    expect(replica.requests).toEqual([])
  })
})

describe("the routing table", () => {
  const resolve = (schema: AnyFieldSchema) => resolveSchema(schema)

  it("names, for each of its methods, a principal field the method's argument really has", () => {
    const methods = serviceMethods(management.actor)
    for (const [method, field] of Object.entries(EFFECTIVE_ID_FIELD)) {
      const spec = methods.get(method)
      expect(spec, method).toBeDefined()
      const arg = resolve(spec!.args[0])
      expect(arg.kind, method).toBe("record")
      const fields = (arg as { fields: Record<string, AnyFieldSchema> }).fields
      expect(Object.keys(fields), method).toContain(field)
      let node = resolve(fields[field])
      // specified_id is `opt principal`: the id when it is given.
      if (field === "specified_id") {
        expect(node.kind, method).toBe("opt")
        node = resolve((node as { inner: AnyFieldSchema }).inner)
      }
      expect(node, method).toMatchObject({
        kind: "primitive",
        primitive: "principal",
      })
    }
  })
})
