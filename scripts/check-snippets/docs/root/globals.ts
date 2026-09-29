// Names the home page's snippets use without importing them: what the default
// app declares. The hooks its examples use are the ones `createActorHooks(backend)`
// returns, and a snippet imports them from `./reactor`. Never a library export:
// a snippet that uses one must import it.
export * from "../../app/globals"
