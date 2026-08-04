# @ic-reactor/parser

WASM-based Candid parser used by IC Reactor tooling and dynamic Candid
workflows. It turns raw Candid source into JavaScript IDL factories or
TypeScript declaration strings.

## Install

```bash
pnpm add @ic-reactor/parser
```

## API

### `default init(module_or_path?): Promise<InitOutput>`

Instantiates the WebAssembly module. **Required before any other export on the
web build** — that is the build bundlers and browsers resolve. The Node build
instantiates itself at import time, so `init()` is a no-op there.

### `initSync(module): InitOutput`

Synchronous variant of `init()` for when you already hold the compiled module or
its bytes.

### `didToJs(candid: string): string`

Returns JavaScript source that exports `idlFactory` and `init`.

### `didToTs(candid: string): string`

Returns TypeScript declaration source for the same Candid interface.

### `parseDid(candid: string): CandidSchema`

Returns a structured description of the interface — the declared types and the
service — instead of generated source.

### `validateIDL(candid: string): boolean`

Returns whether the Candid source parses. Backs `CandidAdapter.validateCandid`.

### `verifyCompatability(a: string, b: string): boolean`

Returns whether two Candid interfaces are upgrade-compatible.

## Example

```ts
import init, { didToJs, didToTs } from "@ic-reactor/parser"

const candid = `service : {
  greet : (text) -> (text) query;
}`

await init() // required on the web build; harmless on Node

const jsSource = didToJs(candid)
const tsSource = didToTs(candid)

console.log(jsSource)
console.log(tsSource)
```

## Where It Is Used

- `@ic-reactor/candid` can load it for local `CandidAdapter` compilation
- `@ic-reactor/codegen` uses it to generate declaration files from `.did`
  sources

If you only need runtime dynamic interaction, install `@ic-reactor/candid` and
let that package load the parser when needed.

## Notes

- The package is compiled from Rust to WebAssembly.
- `didToJs` / `didToTs` return source strings rather than ready-made JS objects.
- There is a single `.` entry point; the right WASM build is picked through
  `package.json` export conditions. `browser`, `workerd` and the `default`
  fallback resolve to the web build, which needs `await init()` first. The
  `node` condition resolves to the Node build, which self-initializes.
  Calling a function on the web build before `init()` throws.

## See Also

- Docs: https://ic-reactor.b3pay.net/v3/packages/parser
- `@ic-reactor/candid`: ../candid/README.md
- `@ic-reactor/codegen`: ../codegen/README.md
