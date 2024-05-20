import { AgentHooks } from "../../context"

/**
 * `useAuth` is a custom React hook designed to manage authentication processes in applications interacting with the Internet Computer (IC).
 * It encapsulates the logic for logging in, logging out, and maintaining the authentication state, leveraging an authentication client.
 *
 * @param options - An optional object containing the following properties:
 * - `onAuthentication`: Callback function triggered before authentication starts.
 * - `onAuthenticationSuccess`: Callback function triggered on successful authentication, receives the authenticated `Identity`.
 * - `onAuthenticationFailure`: Callback function triggered on authentication failure, receives the error.
 * - `onLogin`: Callback function triggered before the login process starts.
 * - `onLoginSuccess`: Callback function triggered on successful login, receives the user's `Principal`.
 * - `onLoginError`: Callback function triggered on login error, receives the error.
 * - `onLoggedOut`: Callback function triggered after logging out.
 *
 * @returns An object containing the following properties:
 * - `authenticated`: Boolean indicating if the user is currently authenticated.
 * - `authenticating`: Boolean indicating if an authentication process is currently underway.
 * - `identity`: The authenticated user's `Identity`, if available.
 * - `error`: Any error that occurred during the authentication process.
 * - `login`: Function to initiate the login process, optionally accepting `LoginParameters`.
 * - `logout`: Function to log the user out, optionally accepting `LogoutParameters`.
 * - `authenticate`: Function to authenticate the user, internally used by `login` and `logout`.
 * - `loginLoading`: Boolean indicating if a login operation is in progress.
 * - `loginError`: Error object if an error occurred during the login process.
 *
 * Usage:
 * This hook can be used to add authentication functionality to your IC application components, handling user login, logout, and authentication state management seamlessly.
 *
 * Example:
 * ```jsx
 * const YourComponent = () => {
 *   const { login, logout, authenticated, identity, loginError } = useAuth({
 *     onLoginSuccess: (principal) => console.log(`Logged in as ${principal}`),
 *     onLoginError: (error) => console.error(`Login failed: ${error.message}`),
 *   });
 *
 *   if (loginError) {
 *     return <div>Error logging in: {loginError.message}</div>;
 *   }
 *
 *   return (
 *     <div>
 *       {authenticated ? (
 *         <>
 *           <div>Authenticated as {identity.getPrincipal().toText()}</div>
 *           <button onClick={() => logout()}>Logout</button>
 *         </>
 *       ) : (
 *         <button onClick={() => login()}>Login</button>
 *       )}
 *     </div>
 *   );
 * };
 * ```
 *
 * This hook simplifies integrating authentication flows into your IC application, providing hooks for various stages of the authentication process.
 */
export const useAuth = AgentHooks.useAuth
