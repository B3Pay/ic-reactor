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
web build**, which is the build bundlers and browsers resolve. The Node build
instantiates itself when it loads, so on Node `init()` and `initSync()` do
nothing. They are exported to ES module imports, so code written for the web
build runs there unchanged.

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

Returns `true` when the Candid source parses and type-checks. It never returns
`false`: for invalid Candid it throws the parser's message as a string (a syntax
error, or a type error such as `Unbound type identifier T`), so call it inside
`try` / `catch`. `CandidAdapter.validateCandid`, which it backs, catches that
and returns `false`.

### `verifyCompatibility(oldDid: string, newDid: string): boolean`

Returns whether `newDid` is a compatible upgrade of `oldDid`, so clients of the
old interface can keep calling the new one. Returns `false` when it is not.
Throws when either source does not parse or type-check, or declares no service.

### `verifyCompatability(a: string, b: string): boolean` (deprecated)

Use `verifyCompatibility(oldDid, newDid)` instead. This older export returns
`true` when `a` is a compatible upgrade of `b`, so it takes the new interface
first, and it throws instead of returning `false` when the upgrade is not
compatible.

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
- Candid imports cannot be resolved from a single source string. Every function
  throws for `import service "file.did"`, because the methods of the imported
  service would be missing from the result. A plain `import "file.did"` is
  ignored, so a type that only the imported file declares is reported as
  unbound.
- There is a single `.` entry point; the right WASM build is picked through
  `package.json` export conditions. `browser`, `workerd` and the `default`
  fallback resolve to the web build, which needs `await init()` first. The
  `node` condition resolves to the Node build, which self-initializes. On
  Node, `import` loads its ES module entry and `require` loads its CommonJS
  entry, and both share one WebAssembly instance.
  Calling a function on the web build before `init()` throws.
- Invalid Candid throws the parser's message as a string. When the parser
  itself fails on an input (a Rust panic, or input nested or repeated deeply
  enough to exhaust the stack), the function throws an `Error` that says the
  input could not be parsed, with the original error as its `cause`. The parser
  replaces its WebAssembly instance before throwing, so later calls keep
  working.

## See Also

- Docs: https://ic-reactor.b3pay.net/v3/packages/parser
- `@ic-reactor/candid`: ../candid/README.md
- `@ic-reactor/codegen`: ../codegen/README.md
