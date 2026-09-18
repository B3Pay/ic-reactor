# Identity Attributes Demo

A focused React example for requesting Internet Identity attributes with
IC Reactor.

It demonstrates:

- `createIdentityAttributeHooks(identityAttributes).useIdentityAttributes()`
- OpenID provider aliases such as `google`, `apple`, and `microsoft`
- Custom OpenID issuer URLs
- `identityAttributeKeys()` scoped key generation
- Handling `signedAttributes.data` and `signedAttributes.signature`

## Run

```bash
cd examples/identity-attributes-demo
pnpm install
pnpm dev
```

The example uses `@icp-sdk/auth` v8. `@ic-reactor/react` supports v8 and v10,
and identity attribute requests go through the same `signIn()` /
`requestAttributes()` API on both.

The app uses package-level auth defaults:

- `ClientManager({ queryClient })` auto-detects browser `ic_env` when present.
- `AuthenticationManager({ clientManager })` reads the Internet Identity
  provider from `ic_env` for local ICP CLI development.
- `@ic-reactor/vite-plugin` runs in env-only mode with
  `icReactor({ canisters: [] })`, so no per-example `identityProvider` or
  `withCanisterEnv: true` setting is required.

For local Internet Identity with ICP CLI, start the local network first:

```bash
icp network start
```

The plugin injects:

```text
INTERNET_IDENTITY_PROVIDER=http://id.ai.localhost:8000/authorize
```

into the `ic_env` cookie during local development.

## Production boundary

The UI displays decoded `email` or `name` values only as a convenience. A real
registration or profile-linking flow must send `signedAttributes.data`,
`signedAttributes.signature`, and the backend-issued nonce to a backend or
canister, then verify the signature, nonce, origin, timestamp, principal, and
requested keys before trusting the attribute values.

## Production nonce flow

Do not generate the production nonce in the browser. The backend or canister
that will verify and store user information should create it.

1. In the click handler, frontend calls `requestOpenIdAttributes()` right away
   and passes a `nonce` callback. Do not call the backend before this: awaiting
   it first ends the click's user gesture, and the browser then blocks the
   Internet Identity window.
2. Inside that callback, frontend calls the backend's `registerBegin` /
   `profileLinkBegin` endpoint, which is the only call to it in the flow.
3. Backend creates a fresh 32-byte nonce, stores a hash of it with expected
   keys, action, origin, principal scope if known, and a short expiry, and
   returns it for the callback to resolve with.
4. Frontend sends `signedAttributes.data`, `signedAttributes.signature`,
   `requestedKeys`, and `principal` to `registerFinish`.
5. Backend verifies the signed attributes, checks the nonce is unused and
   unexpired, confirms origin/timestamp/principal/requested keys, stores only
   required profile fields, then marks the nonce consumed.

```tsx
const { requestOpenIdAttributes } = useIdentityAttributes()

async function registerWithAttributes() {
  const result = await requestOpenIdAttributes({
    // Opens the Internet Identity window right away and fetches the nonce
    // while it loads.
    nonce: async () => {
      const { nonce } = await api.registerBegin({
        expectedKeys: ["email", "name"],
      })
      return nonce
    },
    openIdProvider: "google",
    keys: ["email", "name"],
  })

  await api.registerFinish({
    principal: result.principal,
    requestedKeys: result.requestedKeys,
    signedAttributes: result.signedAttributes,
  })
}
```
