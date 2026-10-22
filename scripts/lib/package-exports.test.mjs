/**
 * Tests of the reading of a package's `exports` that `check-exports.mjs`,
 * `verify-package-artifacts.mjs` and `verify-typescript-floor.js` share.
 *
 * Run by `pnpm test:scripts`.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  exportsMapOf,
  publicSubpaths,
  specifierOf,
} from "./package-exports.mjs"

describe("exportsMapOf", () => {
  it("takes the sugar forms as the root subpath", () => {
    assert.deepEqual(exportsMapOf({ exports: "./index.js" }), {
      ".": "./index.js",
    })
    assert.deepEqual(
      exportsMapOf({ exports: { import: "./a.js", default: "./b.js" } }),
      { ".": { import: "./a.js", default: "./b.js" } }
    )
    assert.deepEqual(
      exportsMapOf({ exports: { ".": "./a.js", "./b": null } }),
      {
        ".": "./a.js",
        "./b": null,
      }
    )
    assert.equal(exportsMapOf({}), undefined)
  })
})

describe("publicSubpaths", () => {
  it("lists the subpaths of the map but ./package.json and a blocked one", () => {
    assert.deepEqual(
      publicSubpaths({
        exports: {
          ".": "./index.js",
          "./testing": "./testing.js",
          "./internal": null,
          "./package.json": "./package.json",
        },
      }),
      [".", "./testing"]
    )
  })

  it("is the root alone for a sugar form or no exports", () => {
    assert.deepEqual(publicSubpaths({ exports: "./index.js" }), ["."])
    assert.deepEqual(publicSubpaths({ exports: ["./a.js", "./b.js"] }), ["."])
    assert.deepEqual(publicSubpaths({ exports: { import: "./a.js" } }), ["."])
    assert.deepEqual(publicSubpaths({ main: "./index.js" }), ["."])
  })
})

describe("specifierOf", () => {
  it("is the name for the root and the name with the subpath otherwise", () => {
    assert.equal(specifierOf("@ic-reactor/core", "."), "@ic-reactor/core")
    assert.equal(
      specifierOf("@ic-reactor/core", "./testing"),
      "@ic-reactor/core/testing"
    )
  })
})
