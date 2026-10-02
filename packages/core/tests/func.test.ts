/**
 * `client.func()`: a func reference from a reply, such as a ledger's archive
 * callback, called through the same path as a canister's methods.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { c, principal, type Principal } from "@candid-core/schema"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import {
  ARCHIVE,
  LEDGER,
  canisterRequests,
  clientAs,
  replicaWith,
  serve,
} from "./canister-helpers.js"
import * as archive from "./fixtures/archive.js"

afterEach(() => {
  vi.unstubAllGlobals()
})

const reader = Ed25519KeyIdentity.generate()

/** The blocks of a range, as the archive holds them. */
const blocksOf = (start: bigint, length: bigint): archive.BlockRange => ({
  blocks: Array.from({ length: Number(length) }, (_, i) => ({
    index: start + BigInt(i),
    memo: new Uint8Array([i]),
  })),
})

/**
 * The archive canister's interface, as the ledger's func types describe it:
 * a service's methods are func schemas, so the generated ones serve as is.
 */
const archiveService = c.service({
  read_range: archive.QueryArchiveFn,
  notify: archive.NotifyFn,
})
type ArchiveActor = {
  read_range: (arg: archive.GetBlocksArgs) => Promise<archive.BlockRange>
  notify: (text: string) => Promise<bigint>
}

/** A ledger whose blocks 0 to 9 are archived, and the archive that holds them. */
function setup(identity: Parameters<typeof clientAs>[1] = reader) {
  const callback = (method: string) => ({
    principal: principal(ARCHIVE),
    method,
  })
  const replica = replicaWith({
    [LEDGER]: serve<archive.Actor>(archive.actor, {
      get_blocks: () => ({
        first_index: 10n,
        blocks: [],
        archived_blocks: [
          { start: 0n, length: 10n, callback: callback("read_range") },
        ],
      }),
      notify_hook: () => callback("notify"),
    }),
    [ARCHIVE]: serve<ArchiveActor>(archiveService, {
      read_range: ([{ start, length }]) => blocksOf(start, length),
      notify: ([text]) => BigInt(text.length),
    }),
  })
  const client = clientAs(replica, identity)
  return {
    replica,
    client,
    ledger: client.canister<archive.Actor>(archive.actor, { id: LEDGER }),
  }
}

const last = <T>(items: readonly T[]): T | undefined => items[items.length - 1]

describe("a func reference", () => {
  it("calls the canister and method it names, with the func type's arguments, results and mode", async () => {
    const { replica, client, ledger } = setup()
    const reply = await ledger.get_blocks({ start: 0n, length: 10n })
    const [range] = reply.archived_blocks
    const read = client.func<
      (arg: archive.GetBlocksArgs) => Promise<archive.BlockRange>
    >(archive.QueryArchiveFn, range.callback)

    await expect(read({ start: range.start, length: 2n })).resolves.toEqual(
      blocksOf(0n, 2n)
    )
    // A query func goes to the query endpoint, as the caller.
    expect(last(canisterRequests(replica))).toMatchObject({
      endpoint: "query",
      canisterId: ARCHIVE,
      methodName: "read_range",
      caller: reader.getPrincipal().toText(),
    })
  })

  it("sends an update func as a call, and refuses it for a caller who is not signed in", async () => {
    const { replica, client, ledger } = setup()
    const hook = await ledger.notify_hook()
    const notify = client.func<(text: string) => Promise<bigint>>(
      archive.NotifyFn,
      hook
    )
    await expect(notify("hello")).resolves.toBe(5n)
    expect(last(canisterRequests(replica))).toMatchObject({
      endpoint: "call",
      canisterId: ARCHIVE,
      methodName: "notify",
    })

    const anonymous = setup("anonymous")
    const refused = anonymous.client.func<(text: string) => Promise<bigint>>(
      archive.NotifyFn,
      hook
    )
    await expect(refused("hello")).rejects.toMatchObject({
      kind: "unauthenticated",
      canisterId: ARCHIVE,
      method: "notify",
    })
    expect(canisterRequests(anonymous.replica)).toEqual([])
  })

  it("rejects arguments that do not match the func type, sending nothing", async () => {
    const { replica, client } = setup()
    const read = client.func<(arg: unknown) => Promise<unknown>>(
      archive.QueryArchiveFn,
      { principal: principal(ARCHIVE), method: "read_range" }
    )
    await expect(read({ start: 1 })).rejects.toMatchObject({
      kind: "invalid_args",
      mayHaveExecuted: false,
    })
    expect(canisterRequests(replica)).toEqual([])
  })

  it("throws a TypeError for a schema that is not a func, or a reference that is not one", () => {
    const { client } = setup()
    const ref = { principal: principal(ARCHIVE), method: "read_range" }
    expect(() => client.func(archive.Block as never, ref)).toThrow(
      /func schema/
    )
    expect(() =>
      client.func(archive.QueryArchiveFn, {
        ...ref,
        principal: "AAAAA-AA" as Principal,
      })
    ).toThrow(/"AAAAA-AA" is not a canister's principal text/)
    expect(() =>
      client.func(archive.QueryArchiveFn, { ...ref, method: "" })
    ).toThrow(TypeError)
  })
})
