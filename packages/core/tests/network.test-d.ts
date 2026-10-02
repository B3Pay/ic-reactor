/**
 * Type-level tests for the network surface: `Network` is the one public type,
 * and what the client builds agents from fits `HttpAgentOptions` as it is.
 * Checked by `tsc` (the package's `typecheck`), not run.
 */
import type { HttpAgentOptions } from "@icp-sdk/core/agent"
import { expectTypeOf } from "vitest"
import type { Network } from "../src/index.js"
import {
  agentOptionsFor,
  resolveCanisterId,
  resolveNetwork,
  type CanisterIdFailure,
  type ResolvedNetwork,
} from "../src/network.js"

// The four shapes a network can take.
const _ic: Network = "ic"
const _local: Network = "local"
const _env: Network = "env"
const _host: Network = { host: "https://testnet.example.com" }
const _full: Network = {
  host: "http://127.0.0.1:4943",
  rootKey: new Uint8Array(133),
  name: "dev",
  fetchRootKey: false,
}

// @ts-expect-error a network is one of the names, not any string
const _unknown: Network = "mainnet"
// @ts-expect-error a custom network needs a host
const _noHost: Network = { rootKey: new Uint8Array(133) }
// @ts-expect-error a root key is bytes, not hex text
const _hexKey: Network = { host: "https://x.example.com", rootKey: "00ff" }
const _fetchText: Network = {
  host: "https://x.example.com",
  // @ts-expect-error fetchRootKey is a boolean
  fetchRootKey: "yes",
}
const _legacy: Network = {
  host: "https://x.example.com",
  // @ts-expect-error the v3 spelling is not carried over
  allowEnvRootKey: true,
}

// @ts-expect-error `allowEnvConfig` is the only opt-in; the v3 spelling is not carried over
resolveNetwork("env", { allowEnvRootKey: true })

// Only the type is public: the resolver is for the client, not for apps.
// @ts-expect-error not exported from the package entry
import { resolveNetwork as _leaked } from "../src/index.js"

// What the client builds an agent from fits the agent's own options as is.
const _options: HttpAgentOptions = agentOptionsFor(resolveNetwork("local"))
expectTypeOf(
  agentOptionsFor(resolveNetwork("ic")).shouldFetchRootKey
).toEqualTypeOf<boolean>()
expectTypeOf(resolveNetwork("ic")).toEqualTypeOf<ResolvedNetwork>()
expectTypeOf(resolveNetwork("ic").rootKey).toEqualTypeOf<
  Uint8Array | undefined
>()

// A failure says which of three problems it was, and a success narrows to an id.
expectTypeOf<CanisterIdFailure>().toEqualTypeOf<
  "no_browser" | "untrusted_host" | "absent"
>()
const resolution = resolveCanisterId({ name: "backend" }, resolveNetwork("env"))
if (resolution.ok) {
  expectTypeOf(resolution.id).toEqualTypeOf<string>()
  expectTypeOf(resolution).not.toHaveProperty("reason")
} else {
  expectTypeOf(resolution.reason).toEqualTypeOf<CanisterIdFailure>()
  expectTypeOf(resolution.message).toEqualTypeOf<string>()
  expectTypeOf(resolution).not.toHaveProperty("id")
}

// @ts-expect-error a target is { id } or { name }
resolveCanisterId({ address: "x" }, resolveNetwork("ic"))
