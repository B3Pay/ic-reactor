# Identity Attributes Demo

A focused React example for the IC Reactor v3.4 Internet Identity attributes
feature.

It demonstrates:

- `createAuthHooks(clientManager).useIdentityAttributes()`
- OpenID provider aliases such as `google`, `apple`, and `microsoft`
- Custom OpenID issuer URLs
- `identityAttributeKeys()` scoped key generation
- Handling `signedAttributes.data` and `signedAttributes.signature`

## Run

```bash
cd examples/identity-attributes-demo
npm install
npm run dev
```

The example uses `@icp-sdk/auth` v6 because identity attribute requests depend
on the v6 `signIn()` / `requestAttributes()` API.

## Production boundary

The UI displays decoded `email` or `name` values only as a convenience. A real
registration or profile-linking flow must send `signedAttributes.data`,
`signedAttributes.signature`, and the backend-issued nonce to a backend or
canister, then verify the signature, nonce, origin, timestamp, principal, and
requested keys before trusting the attribute values.

## Production nonce flow

Do not generate the production nonce in the browser. The backend or canister
that will verify and store user information should create it.

1. Call a backend `registerBegin` / `profileLinkBegin` endpoint.
2. Backend creates a fresh 32-byte nonce, stores a hash of it with expected
   keys, action, origin, principal scope if known, and a short expiry.
3. Frontend passes that nonce to `requestOpenIdAttributes()`.
4. Frontend sends `signedAttributes.data`, `signedAttributes.signature`,
   `requestedKeys`, and `principal` to `registerFinish`.
5. Backend verifies the signed attributes, checks the nonce is unused and
   unexpired, confirms origin/timestamp/principal/requested keys, stores only
   required profile fields, then marks the nonce consumed.

```tsx
const { requestOpenIdAttributes } = useIdentityAttributes()

async function registerWithAttributes() {
  const { nonce } = await api.registerBegin({
    expectedKeys: ["email", "name"],
  })

  const result = await requestOpenIdAttributes({
    nonce,
    openIdProvider: "google",
    keys: ["email", "name"],
    identityProvider: IDENTITY_ATTRIBUTES_BETA_PROVIDER,
  })

  await api.registerFinish({
    principal: result.principal,
    requestedKeys: result.requestedKeys,
    signedAttributes: result.signedAttributes,
  })
}
```
