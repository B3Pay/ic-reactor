# @ic-reactor/parser

WASM-based Candid parser used by IC Reactor tooling and dynamic Candid
workflows. It turns raw Candid source into JavaScript IDL factories or
TypeScript declaration strings.

## AI Assistants

- Full guide: https://ic-reactor.b3pay.net/llms-full.txt
- Project AI guide: https://ic-reactor.b3pay.net/v3/guides/ai-friendliness/

Install the shared hook skill in consumer repos:

```bash
npx skills add B3Pay/ic-reactor-skills --full-depth --skill ic-reactor-hooks
```

## Install

```bash
pnpm add @ic-reactor/parser
```

## API

### `didToJs(candid: string): string`

Returns JavaScript source that exports `idlFactory` and `init`.

### `didToTs(candid: string): string`

Returns TypeScript declaration source for the same Candid interface.

## Example

```ts
import { didToJs, didToTs } from "@ic-reactor/parser"

const candid = `service : {
  greet : (text) -> (text) query;
}`

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
- It returns source strings rather than ready-made JS objects.
- Browser environments need standard WASM support from the bundler/runtime.

## See Also

- Docs: https://ic-reactor.b3pay.net/v3/packages/parser
- `@ic-reactor/candid`: ../candid/README.md
- `@ic-reactor/codegen`: ../codegen/README.md
