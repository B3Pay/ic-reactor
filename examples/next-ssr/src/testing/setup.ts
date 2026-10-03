// Every read in these tests goes through a real client to an in-memory
// replica that signs each reply, and the client checks those signatures: a
// few reads take tens of milliseconds on a laptop, and several times that on
// a CI runner that runs the examples' suites side by side. testing-library's
// `waitFor` gives up after 1 s by default, which a slow runner can exceed with
// nothing wrong; 5 s leaves room for that and still fails a read that never
// lands.
import { configure } from "@testing-library/react"

configure({ asyncUtilTimeout: 5_000 })
