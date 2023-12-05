import { createReActor } from "@ic-reactor/core"
import { canisterId, createActor } from "../declarations/hello_actor"

test("Main Function Test", async () => {
  // This is the test case
  const { ReActorProvider, callActor, useReActor } = createReActor((agent) =>
    createActor(canisterId, {
      agent,
    })
  )

  // Here, you would add assertions to check the behavior of your code
  // For example:
  // expect(someValue).toBe(expectedValue);
})
