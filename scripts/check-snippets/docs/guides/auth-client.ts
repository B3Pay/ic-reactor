// The Auth guide's `./auth-client`: the browser-only module that keeps its own
// AuthClient and hands it to the client, as the guide shows.
import { AuthClient } from "@icp-sdk/auth/client"

export const authClient = new AuthClient({ openIdProvider: "google" })
