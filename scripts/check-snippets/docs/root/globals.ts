// Names the home page's snippets use without importing them: what the default
// app declares, plus the hooks its "Best of Both Worlds" example uses before
// the setup that creates them, `createActorHooks(backend)`, further down the
// page. Never a library export: a snippet that uses one must import it.
export * from "../../app/globals"
export { useActorMutation, useActorQuery } from "./reactor"
