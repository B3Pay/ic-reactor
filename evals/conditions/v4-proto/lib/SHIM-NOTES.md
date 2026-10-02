# Shim notes (not shipped)

Where the prototype had to work around `@candid-core/schema` 0.2.0. These
notes used to live as `AWKWARD`/`SHIM` comments in `src/`; they were moved
here so the package an agent sees (`dist/` + `package.json`) reads like an
ordinary package. `evals/README.md` ("Shims over @candid-core/schema") has
the full discussion.

| Where                                  | What                                                                                                                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/service.ts` `defineService`       | `c.func` / `c.service` are non-generic and the service is typed `Schema<PrincipalValue>`, so modes are re-declared by hand beside the generated `Actor` type and checked at load: two inputs for one fact. |
| `src/principal.ts` `Textify`           | A structural rewrite of the generated types keyed on `{ toText(): string }`; a record with a `toText` func field would be rewritten too. A principal-representation option or nominal type would fix it.   |
| `src/principal.ts` `mentionsPrincipal` | Re-derives "does this schema mention a principal" by walking every node kind; the schema package has no such query or schema-directed value map.                                                           |
| `src/client.ts` `once` (query path)    | `httpTransport.query` folds the reject code into an `Error` message, so the agent is called directly.                                                                                                      |
| `src/client.ts` `encode`/`decode`      | `ActorError` has no stage (encode vs decode), so `createActor` is bypassed for `serviceMethods` + `encodeArgs`/`decodeArgs`.                                                                               |
| `src/client.ts` `decode`               | `unwrapResult` returns neither the arm schema nor the tag, so the variant is re-resolved and `Ok` vs `ok` guessed.                                                                                         |
| `src/client.ts` `cancelled`            | `Transport` takes no `AbortSignal`; cancellation is checked before and after the request only.                                                                                                             |

`starter/src/generated/icrc1.service.ts` is hand-written: it stands in for
what a generic `c.service` would let the generator emit.
