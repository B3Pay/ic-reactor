export const REMOTE_HOSTS = [".github.dev", ".gitpod.io"]

export const LOCAL_HOSTS = ["localhost", "127.0.0.1"]

export const IC_HOST_NETWORK_URI = "https://ic0.app"

export const LOCAL_HOST_NETWORK_URI = "http://127.0.0.1:4943"

export const IC_INTERNET_IDENTITY_PROVIDER = "https://id.ai/authorize"

/**
 * Well-known Internet Identity canister ID used when deploying II locally
 * via the official `internet_identity_production.wasm.gz`. This is the
 * canonical principal used by both `dfx` and `icp-cli` setups when no
 * custom canister ID is provided.
 */
export const LOCAL_INTERNET_IDENTITY_CANISTER_ID = "rdmx6-jaaaa-aaaaa-aaadq-cai"

/**
 * Builds the local Internet Identity provider URL for the given replica port.
 *
 * @param port - Port the local replica is exposed on (e.g. `4943` for dfx,
 *   `8000` for icp-cli managed networks).
 * @param canisterId - Internet Identity canister ID. Defaults to the
 *   well-known principal {@link LOCAL_INTERNET_IDENTITY_CANISTER_ID}.
 */
export const localInternetIdentityProvider = (
  port: number,
  canisterId: string = LOCAL_INTERNET_IDENTITY_CANISTER_ID
) => `http://${canisterId}.localhost:${port}/authorize`

/**
 * Legacy default for the local Internet Identity provider URL, hardcoded
 * to dfx's default replica port (`4943`). Prefer {@link localInternetIdentityProvider}
 * which accepts the configured port.
 */
export const LOCAL_INTERNET_IDENTITY_PROVIDER =
  localInternetIdentityProvider(4943)
