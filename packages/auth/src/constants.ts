export const IC_INTERNET_IDENTITY_PROVIDER = "https://id.ai/authorize"

/**
 * Well-known Internet Identity canister ID used when deploying II locally.
 */
export const LOCAL_INTERNET_IDENTITY_CANISTER_ID = "rdmx6-jaaaa-aaaaa-aaadq-cai"

/**
 * Builds the local Internet Identity provider URL for the given replica port.
 */
export const localInternetIdentityProvider = (
  port: number,
  canisterId: string = LOCAL_INTERNET_IDENTITY_CANISTER_ID
) => `http://${canisterId}.localhost:${port}/authorize`

/**
 * Legacy default URL for local Internet Identity, using port `4943`.
 */
export const LOCAL_INTERNET_IDENTITY_PROVIDER =
  localInternetIdentityProvider(4943)
