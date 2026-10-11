/**
 * The plugin's options, read once when the plugin is made, each value checked
 * before the plugin does anything with it.
 *
 * A JavaScript config is not type-checked, so an option can hold a value of
 * any kind. Only an omitted option (`undefined`) is one not given: every
 * value given is checked, on every canister, with a `didFile` or not, and
 * whether or not a run would use it, and quoted in a message by
 * `describeValue`, which never throws.
 *
 * - An option of the whole plugin (`canisters`, `injectEnvironment`,
 *   `failOnError`) that is not one throws when the config loads: read by a
 *   guess, it could ship stale bindings or drop the local environment.
 * - A canister whose options hold a value that is not one is refused. Every
 *   run fails it, with the reasons, before the run does anything else: it
 *   fetches nothing, writes nothing, runs no `candid-core-cli` process and
 *   makes no request for it, and the other canisters run as they would. Its
 *   name is still in the `ic_env` cookie, which carries every canister an
 *   entry names: the app may still call it.
 *
 * Each option is read once, here: a getter runs once, and one that throws
 * refuses its canister. What the plugin keeps is a copy of what was read.
 *
 * Only `undefined` selects an option's default: every default here is chosen
 * by `=== undefined`, never by `??` or `||`, which would take `null` (or `0`,
 * `""`, `false`) for an option not given. Each value but `undefined` is
 * checked first, and one that is not a value of the option is refused.
 *
 * A canister's name is any text: `__proto__`, `constructor` and `toString`
 * name canisters as any other text does. What the plugin keeps by canister
 * name is kept in a `Map`, never in a plain object, where such a name would
 * reach `Object.prototype` (an assignment to `__proto__` sets the prototype,
 * and a lookup of `toString` finds a function).
 */

import { describeError, describeValue } from "./describe-value.js"
import { resolveNetwork, type CanisterNetwork } from "./fetch.js"
import { isPrincipalText } from "./principal-text.js"

/** Where a canister's module goes when it sets no `outDir`. */
export const DEFAULT_OUT_DIR = "src/canisters"

/** A canister with a `.did` to generate from: its options, every one checked. */
export interface Generated {
  name: string
  didFile: string
  outDir: string
  /** The live canister its `didFile` is fetched from when it is not on disk. */
  canisterId?: string
  network?: CanisterNetwork
  /** The methods a fetched `didFile` is projected to. */
  methods?: readonly string[]
  verify?: "live"
}

/** A canister whose options cannot be used, and why. */
export interface Refused {
  name: string
  /** Every reason, in the order of the options. */
  problem: string
  /**
   * Its `didFile`, when that is a path. Canisters that share a `didFile` to
   * be fetched share its fetch, so a refused one refuses it for them all.
   */
  didFile?: string
  /** Whether it gave a `canisterId`, of any value, as a canister to fetch from does. */
  givesCanisterId: boolean
}

/** The plugin's options as read and checked. */
export interface ReadOptions {
  injectEnvironment: boolean
  failOnError: boolean | undefined
  /** Every canister an entry names, which the `ic_env` cookie carries. */
  names: string[]
  /**
   * The cookie's ID of each canister whose `canisterId` is one, by canister
   * name: a `Map`, so that any name is kept as given.
   */
  configuredCanisterIds: Map<string, string>
  /** `name: value` for each `canisterId` given that is not one. */
  notCanisterIds: string[]
  /** The canisters with a `didFile` whose options are all values. */
  generated: Generated[]
  /**
   * The canisters that are refused: one whose options hold a value that is
   * not one, with a `didFile` or not, and one whose options cannot be read.
   */
  refused: Refused[]
}

/** An object of options: not `null`, a list or a function. Never throws. */
function isOptionsObject(value: unknown): value is Record<string, unknown> {
  try {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  } catch {
    // A revoked proxy.
    return false
  }
}

/** `value` as a path to read or write, relative to the Vite root. */
const isPath = (value: unknown): value is string =>
  typeof value === "string" && value !== "" && !value.includes("\0")

/**
 * Why a boolean option is not one, or `undefined` when it is omitted or a
 * boolean. Read by truthiness, `0`, `""` or `null` would turn the option off
 * and `"false"` would turn it on, without a word.
 */
export function booleanProblem(
  name: string,
  value: unknown
): string | undefined {
  if (value === undefined || typeof value === "boolean") return undefined
  return (
    `[ic-reactor] ${name} is ${describeValue(value)}, not true or false: ` +
    `set it to true or false, or remove it for the default`
  )
}

/** Why `methods` cannot be projected to, or `undefined` when it can. */
export function methodsProblem(methods: unknown): string | undefined {
  if (methods === undefined) return undefined
  if (!Array.isArray(methods)) {
    return `methods is ${describeValue(methods)}, not a list of method names`
  }
  if (methods.length === 0) {
    return "methods is empty: name the methods the app calls, or remove methods for the whole interface"
  }
  for (const name of methods as unknown[]) {
    if (typeof name !== "string" || name === "") {
      return `methods holds ${describeValue(name)}, which is not a method name`
    }
    if (name.includes(",")) {
      return `methods names ${describeValue(name)}, which has a comma: candid-core-cli project takes the names separated by commas, so it cannot be projected to`
    }
  }
  return undefined
}

/**
 * Why `verify` is not an option value, or `undefined` when it is: omitted, or
 * `"live"`.
 */
export function verifyProblem(verify: unknown): string | undefined {
  if (verify === undefined || verify === "live") return undefined
  return `verify is ${describeValue(verify)}, not "live": set it to "live" for the live check, or remove it for none`
}

/**
 * Why `canisterId` is not a canister ID, or `undefined` when it is one or is
 * omitted. A canister ID is the text of a principal, which is told here, and
 * not only by the fetch or the check that reads it: those load
 * `@icp-sdk/core`, and a canister with `methods` would have its methods
 * listed, by a `candid-core-cli` process, before its check found the ID wrong.
 */
export function canisterIdProblem(canisterId: unknown): string | undefined {
  if (canisterId === undefined) return undefined
  if (typeof canisterId !== "string" || canisterId === "") {
    return `canisterId is ${describeValue(canisterId)}, not a canister ID: give the canister's principal as text, or remove canisterId`
  }
  if (isPrincipalText(canisterId)) return undefined
  return (
    `canisterId is ${describeValue(canisterId)}, not a canister ID: it is not the text of a principal, ` +
    `which is lowercase, in groups of five joined by dashes, with a checksum. ` +
    `Give the canister's ID as it is printed, or remove canisterId`
  )
}

/** A read of one option: its value, or what reading it threw. */
type Read = { value: unknown; threw?: undefined } | { threw: string }

/** Read `key` of `object`, once. Never throws. */
function readKey(object: Record<string, unknown>, key: string): Read {
  try {
    return { value: object[key] }
  } catch (error) {
    return { threw: describeError(error) }
  }
}

/**
 * The plugin's options, read and checked. Throws an `Error` that says what to
 * change for an option of the whole plugin that is not one; a canister's
 * options never throw, and refuse that canister instead.
 */
export function readOptions(given: unknown): ReadOptions {
  const options = given === undefined ? {} : given
  if (!isOptionsObject(options)) {
    throw new Error(
      `[ic-reactor] the options are ${describeValue(options)}, not an object: give icReactor() an object of options, or none`
    )
  }
  const top = (key: string): unknown => {
    const read = readKey(options, key)
    if (read.threw !== undefined) {
      throw new Error(
        `[ic-reactor] the option ${key} could not be read: ${read.threw}`
      )
    }
    return read.value
  }
  // Thrown, so that the config does not load: either value read by guess
  // could ship stale bindings or drop the local environment.
  const injectEnvironment = top("injectEnvironment")
  const failOnError = top("failOnError")
  const problem =
    booleanProblem("injectEnvironment", injectEnvironment) ??
    booleanProblem("failOnError", failOnError)
  if (problem) throw new Error(problem)

  // Only an omitted `canisters` is none: `null` is refused below, as any other
  // value that is not an object of canisters is.
  const givenCanisters = top("canisters")
  const canisters = givenCanisters === undefined ? {} : givenCanisters
  if (!isOptionsObject(canisters)) {
    throw new Error(
      `[ic-reactor] canisters is ${describeValue(canisters)}, not an object of canisters by name: ` +
        `give each canister's options under its name, or remove canisters`
    )
  }
  let keys: string[]
  try {
    keys = Object.keys(canisters)
  } catch (error) {
    throw new Error(
      `[ic-reactor] the canisters could not be listed: ${describeError(error)}`
    )
  }

  const read: ReadOptions = {
    // Checked above: `undefined` or a boolean.
    injectEnvironment:
      injectEnvironment === undefined ? true : (injectEnvironment as boolean),
    failOnError: failOnError as boolean | undefined,
    names: [],
    configuredCanisterIds: new Map(),
    notCanisterIds: [],
    generated: [],
    refused: [],
  }
  for (const name of keys) {
    const entry = readKey(canisters, name)
    // Omitted, as a conditional entry of a JavaScript config is.
    if (entry.threw === undefined && entry.value === undefined) continue
    read.names.push(name)
    if (entry.threw !== undefined || !isOptionsObject(entry.value)) {
      read.refused.push({
        name,
        problem:
          entry.threw !== undefined
            ? `its options could not be read: ${entry.threw}`
            : `its options are ${describeValue(entry.value)}, not an object of options (didFile, canisterId, …)`,
        givesCanisterId: false,
      })
      continue
    }
    readCanister(name, entry.value, read)
  }
  return read
}

/** Read and check the options of the canister `name`, into `read`. */
function readCanister(
  name: string,
  entry: Record<string, unknown>,
  read: ReadOptions
): void {
  const problems: string[] = []
  /** The value of `key`, `undefined` with a problem when reading it threw. */
  const value = (key: string): unknown => {
    const result = readKey(entry, key)
    if (result.threw === undefined) return result.value
    problems.push(`${key} could not be read: ${result.threw}`)
    return undefined
  }

  const didFile = value("didFile")
  const didFileThrew = problems.length > 0
  // A canister with no `didFile` generates nothing, and is only named in the
  // cookie. Its other options are checked all the same: a value that is not
  // one refuses it too.
  const hasDidFile = didFile !== undefined || didFileThrew
  const canisterIdRead = readKey(entry, "canisterId")
  const canisterId =
    canisterIdRead.threw === undefined ? canisterIdRead.value : undefined
  const canisterIdWrong =
    canisterIdRead.threw === undefined
      ? canisterIdProblem(canisterId)
      : undefined

  // The cookie's: a configured ID wins over the one `icp` reports. Only a
  // principal's text can be one: any other value given is left to `icp`, with
  // a warning, rather than put in the cookie or taken for no canisterId.
  if (canisterIdRead.threw !== undefined) {
    read.notCanisterIds.push(
      `${name}: could not be read (${canisterIdRead.threw})`
    )
  } else if (canisterId !== undefined && canisterIdWrong === undefined) {
    read.configuredCanisterIds.set(name, canisterId as string)
  } else if (canisterId !== undefined) {
    read.notCanisterIds.push(`${name}: ${describeValue(canisterId)}`)
  }

  if (didFile !== undefined && !isPath(didFile)) {
    problems.push(
      `didFile is ${describeValue(didFile)}, not a path: give the canister's .did file relative to the Vite root, ` +
        `or remove didFile for a canister that is only named in the ic_env cookie`
    )
  }
  const outDir = value("outDir")
  if (outDir !== undefined && !isPath(outDir)) {
    problems.push(
      `outDir is ${describeValue(outDir)}, not a path: give the directory relative to the Vite root, ` +
        `or remove outDir for "src/canisters"`
    )
  }
  if (canisterIdRead.threw !== undefined) {
    problems.push(`canisterId could not be read: ${canisterIdRead.threw}`)
  } else if (canisterIdWrong !== undefined) {
    problems.push(canisterIdWrong)
  }

  // A copy: `{ host }` read once, so that no getter of the object given runs
  // again when the network is resolved.
  const givenNetwork = value("network")
  let network: CanisterNetwork | undefined
  if (isOptionsObject(givenNetwork)) {
    const host = readKey(givenNetwork, "host")
    if (host.threw !== undefined) {
      problems.push(`network.host could not be read: ${host.threw}`)
    } else {
      network = { host: host.value } as CanisterNetwork
    }
  } else {
    network = givenNetwork as CanisterNetwork | undefined
  }
  if (network !== undefined) {
    const resolved = resolveNetwork(network)
    if (typeof resolved === "string") problems.push(resolved)
  }

  // A copy of the list, read once.
  let methods = value("methods")
  try {
    if (Array.isArray(methods)) methods = Array.from(methods as unknown[])
  } catch (error) {
    problems.push(`methods could not be read: ${describeError(error)}`)
    methods = undefined
  }
  const methodsWrong = methodsProblem(methods)
  if (methodsWrong) problems.push(methodsWrong)

  const verify = value("verify")
  const verifyWrong = verifyProblem(verify)
  if (verifyWrong) {
    problems.push(verifyWrong)
  } else if (verify === "live" && hasDidFile && canisterId === undefined) {
    // With no `didFile`, there is nothing to check: `"live"` is a value, and
    // unused.
    if (canisterIdRead.threw === undefined) {
      problems.push(
        `verify is "live", but it names no canisterId to check its didFile against`
      )
    }
  }

  if (problems.length > 0) {
    read.refused.push({
      name,
      problem: problems.join("; "),
      didFile: isPath(didFile) ? didFile : undefined,
      givesCanisterId: canisterId !== undefined || !!canisterIdRead.threw,
    })
    return
  }
  if (!hasDidFile) return
  read.generated.push({
    name,
    didFile: didFile as string,
    // Checked above: `undefined` or a path.
    outDir: outDir === undefined ? DEFAULT_OUT_DIR : (outDir as string),
    canisterId: canisterId as string | undefined,
    network,
    methods: methods as readonly string[] | undefined,
    verify: verify as "live" | undefined,
  })
}
