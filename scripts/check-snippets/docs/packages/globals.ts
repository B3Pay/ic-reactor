// Names the package pages' snippets use without importing them: what the
// default app declares, plus the `backend` reactor the Quick Starts of the core
// and react pages build and the identity-attribute examples reuse. Never a
// library export: a snippet that uses one must import it.
export * from "../../app/globals"
export { backend } from "./reactor"
