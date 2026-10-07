/**
 * The 34 names ic-reactor 3 exported that 4.0 removes, each with what to use
 * instead. It is the "Removed in 4.0" table of the migration page (DX2, #789)
 * as data, so `check-ai-context.js` can keep the 4.x guides from teaching a
 * name that no longer exists.
 *
 * The names are those imported from `@ic-reactor/core` and `@ic-reactor/react`
 * by the hand-written files of the 3.x examples: the v1 to v3 memory an agent
 * or a person brings to the package. (`@ic-reactor/candid` stays at 3.x, and
 * `icReactor` of the Vite plugin is kept, so neither is listed.)
 *
 * A name is stale in a guide wherever it appears outside a section headed
 * "Removed in 4.0". Two names need care in how they are found, and say so:
 *
 * - `Reactor` is a name in code and also the name of the product, "IC Reactor".
 *   The product name is not a mention.
 * - `skipToken` is a name that survives, from `@tanstack/react-query`: it is
 *   removed from `@ic-reactor/react`, so only importing it from there (or a
 *   sentence naming both) is stale.
 *
 * @type {{ name: string, use: string, fromTanStack?: boolean }[]}
 */
export const REMOVED_V3_NAMES = [
  { name: "ClientManager", use: "createClient({ network, identity | auth })" },
  {
    name: "formatTokenAmount",
    use: "formatUnits(value, decimals, { maxFractionDigits })",
  },
  {
    name: "AuthenticationManager",
    use: "auth: (network) => new AuthClient(network) from @icp-sdk/auth 10",
  },
  { name: "createAuthHooks", use: "useAuth()" },
  {
    name: "createMutation",
    use: "useMutation(client.mutationOptions(canister, method))",
  },
  {
    name: "createQuery",
    use: "useQuery(client.queryOptions(canister, method, arg))",
  },
  {
    name: "createActorHooks",
    use: "useClient().canister<Actor>(actor, { id }) and TanStack hooks",
  },
  {
    name: "createSuspenseQuery",
    use: "useSuspenseQuery over client.queryOptions(...) (docs: Reads, Suspense)",
  },
  {
    name: "DisplayReactor",
    use: "candid-core values, and formatUnits/parseUnits",
  },
  { name: "Reactor", use: "client.canister<Actor>(actor, { id })" },
  {
    name: "createReactorProvider",
    use: "<ReactorProvider client={() => createClient(...)}>",
  },
  { name: "parseTokenAmount", use: "parseUnits(text, decimals)" },
  { name: "defineReactor", use: "createClient and client.canister" },
  { name: "isPrincipalText", use: "isPrincipal from @candid-core/schema" },
  {
    name: "generateKey",
    use: "client.queryKey(canister, method?, arg?)",
  },
  { name: "createQueryFactory", use: "client.queryOptions" },
  {
    name: "CanisterError",
    use: "isReactorError(e) && e.kind === 'canister_err' (ReactorError is a type, not a class)",
  },
  {
    name: "createSuspenseQueryFactory",
    use: "useSuspenseQuery over client.queryOptions(...) (docs: Reads, Suspense)",
  },
  {
    name: "isCanisterError",
    use: "isReactorError(e) && e.kind === 'canister_err'",
  },
  {
    name: "createInfiniteQuery",
    use: "useInfiniteQuery with a key extending client.queryKey and direct calls (docs: Reads, Infinite queries)",
  },
  { name: "DisplayOf", use: "nothing: there is one value shape" },
  { name: "ReactorArgs", use: "Parameters<Actor['method']>" },
  {
    name: "identityAttributeKeys",
    use: "scopedKeys({ openIdProvider, keys }) from @icp-sdk/auth/client",
  },
  {
    name: "IdentityAttributeOpenIdProvider",
    use: "OpenIdProvider from @icp-sdk/auth/client",
  },
  {
    name: "IdentityAttributesManager",
    use: "authClient.requestAttributes({ keys, nonce }), then decode data (docs: Auth, Identity attributes)",
  },
  {
    name: "createIdentityAttributeHooks",
    use: "authClient.requestAttributes({ keys, nonce }), then decode data (docs: Auth, Identity attributes)",
  },
  {
    name: "skipToken",
    use: "skipToken from @tanstack/react-query",
    fromTanStack: true,
  },
  { name: "reactorRetry", use: "built into client.queryOptions" },
  { name: "ReactorArgsOf", use: "Parameters<Actor[M]>" },
  {
    name: "defineDisplayReactor",
    use: "createClient and client.canister",
  },
  {
    name: "createSuspenseInfiniteQueryFactory",
    use: "useSuspenseInfiniteQuery with a key extending client.queryKey (docs: Reads, Infinite queries)",
  },
  {
    name: "isCallError",
    use: "isReactorError(e) && e.kind !== 'canister_err'",
  },
  { name: "ReactorErrorOf", use: "ReactorError<E>" },
  {
    name: "jsonToString",
    use: "JSON.stringify (principals are text; a bigint needs a replacer)",
  },
]
