import { describe, it } from "node:test"
import { strict as assert } from "node:assert"
import { c, MethodSchema } from "./index.js"

describe("method schemas", () => {
  it("supports valid oneway methods without return schemas", () => {
    const schema = c.oneway([c.text()])

    assert.equal(schema.mode, "oneway")
    assert.equal(schema.args.length, 1)
    assert.equal(schema.returns.length, 0)
    assert.equal(schema.toDid("notify"), "notify : (text) -> () oneway")
  })

  it("rejects direct invalid oneway construction with return schemas", () => {
    assert.throws(
      () => new MethodSchema([c.text()], [c.text()], "oneway"),
      /Candid oneway methods cannot return values/
    )
  })
})

// @ts-expect-error oneway methods cannot return values
c.oneway([c.text()], c.text())
