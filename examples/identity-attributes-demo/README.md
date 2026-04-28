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
