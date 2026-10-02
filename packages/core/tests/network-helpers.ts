/**
 * Fixtures for the network tests: a fake page, the `ic_env` cookie it carries,
 * and the process environment a server reads.
 *
 * The page and the cookie are faked at the global the code reads
 * (`window`, `document.cookie`, `location`), and the cookie is parsed by the
 * real `safeGetCanisterEnv`, so the tests cover the cookie's format as well as
 * the decision about whether to read it.
 */
import { vi } from "vitest"

/**
 * A recognisable root key of the length the cookie reader accepts (133 bytes),
 * so a key taken from the cookie is distinguishable from the mainnet key the
 * agent ships with and from the key a replica reports. Any 133 bytes satisfy
 * the reader, which is exactly why the cookie is not evidence of anything.
 */
export const COOKIE_ROOT_KEY = new Uint8Array(133).fill(7)

/** The key a fake replica reports on `/api/v2/status`. */
export const REPLICA_ROOT_KEY = new Uint8Array(133).fill(9)

/** A key a caller hands in, distinct from the other two. */
export const GIVEN_ROOT_KEY = new Uint8Array(133).fill(5)

/** The id an attacker-writable cookie would carry. */
export const COOKIE_CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"

export const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")

export const sameBytes = (
  a: Uint8Array | null | undefined,
  b: Uint8Array
): boolean =>
  a !== null &&
  a !== undefined &&
  a.length === b.length &&
  a.every((byte, i) => byte === b[i])

/**
 * The value of a `document.cookie` carrying `ic_env`, as an asset canister or
 * the Vite plugin writes it: URL-encoded `name=value` pairs joined by `&`, the
 * root key as hex.
 */
export const icEnvCookie = (
  entries: Record<string, string> = {
    "PUBLIC_CANISTER_ID:backend": COOKIE_CANISTER_ID,
  },
  rootKey: Uint8Array | null = COOKIE_ROOT_KEY
): string => {
  const pairs = Object.entries(entries).map(([k, v]) => `${k}=${v}`)
  if (rootKey) pairs.unshift(`ic_root_key=${hex(rootKey)}`)
  return `ic_env=${encodeURIComponent(pairs.join("&"))}`
}

export interface FakePage {
  /** How many times the code read `document.cookie`. */
  readonly cookieReads: () => number
}

/**
 * Makes the code run in a browser page at `origin`, whose `document.cookie` is
 * `cookie` (the `ic_env` cookie by default). Undo with `vi.unstubAllGlobals()`.
 */
export const stubPage = (
  origin: string,
  { cookie = icEnvCookie() }: { cookie?: string } = {}
): FakePage => {
  let reads = 0
  vi.stubGlobal("window", {
    location: { origin, protocol: new URL(origin).protocol },
  })
  vi.stubGlobal("document", {
    get cookie() {
      reads++
      return cookie
    },
  })
  return { cookieReads: () => reads }
}

/**
 * Makes the code run where there is no `window` but a cookie jar exists to
 * read: a server (or worker) that a careless reader would still find a
 * `document` on. `location` is a web worker's, when given.
 */
export const stubNoWindow = ({
  cookie = icEnvCookie(),
  workerOrigin,
}: { cookie?: string; workerOrigin?: string } = {}): FakePage => {
  let reads = 0
  vi.stubGlobal("window", undefined)
  vi.stubGlobal("document", {
    get cookie() {
      reads++
      return cookie
    },
  })
  vi.stubGlobal("location", workerOrigin ? { origin: workerOrigin } : undefined)
  return { cookieReads: () => reads }
}

/**
 * Clears the variables a server reads, so a developer's shell cannot change a
 * result, then sets those given. Undo with `vi.unstubAllEnvs()`.
 */
export const stubProcessEnv = (
  env: Partial<
    Record<"ICP_NETWORK" | "DFX_NETWORK" | "ICP_HOST" | "IC_HOST", string>
  > = {}
): void => {
  for (const name of [
    "ICP_NETWORK",
    "DFX_NETWORK",
    "ICP_HOST",
    "IC_HOST",
  ] as const) {
    vi.stubEnv(name, env[name])
  }
}
