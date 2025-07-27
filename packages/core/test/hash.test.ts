// test.spec.ts
import { describe, test, beforeEach, expect } from "bun:test"
import { createSimpleHash } from "../src/utils"

// Types
type TestObject = {
  name: string
  value: unknown
  hash?: string
}

// Helper functions
function createDeepObject(
  depth: number,
  value: boolean,
  prefix: string = ""
): Record<string, unknown> {
  if (depth === 0) {
    return { [`${prefix}test`]: value }
  }
  return {
    [`${prefix}test`]: value,
    [`${prefix}deep`]: [createDeepObject(depth - 1, !value, `inner${depth}_`)],
  }
}

function createArrayObject(size: number): unknown[] {
  return Array.from({ length: size }, (_, i) => ({
    index: i,
    value: `test${i}`,
    nested: { data: `nested${i}` },
  }))
}

function createComplexObject(depth: number): Record<string, unknown> {
  return {
    string: "test",
    number: 123,
    boolean: true,
    null: null,
    undefined: undefined,
    array: [1, 2, 3],
    date: new Date("2024-01-01"),
    nested: depth > 0 ? createComplexObject(depth - 1) : null,
    buffer: new Uint8Array([1, 2, 3]),
  }
}

// Generate test objects
function generateTestObjects(): TestObject[] {
  return [
    { name: "Simple object", value: { test: "value" } },
    { name: "Deep object 1", value: createDeepObject(3, false) },
    { name: "Deep object 2", value: createDeepObject(3, true) },
    { name: "Array object", value: createArrayObject(5) },
    { name: "Complex object", value: createComplexObject(2) },
    {
      name: "Mixed types",
      value: {
        str: "test",
        num: 123,
        bool: true,
        arr: [1, "2", true],
        obj: {
          nested: {
            value: [[[[[[[[[[[[[[[[[[[[[[{ value: 1 }]]]]]]]]]]]]]]]]]]]]]],
          },
        },
      },
    },
    {
      name: "Mixed types2",
      value: {
        str: "test",
        num: 123,
        bool: true,
        arr: [1, "2", true],
        obj: {
          nested: {
            value: [[[[[[[[[[[[[[[[[[[[[[{ value: 10 }]]]]]]]]]]]]]]]]]]]]]],
          },
        },
      },
    },
    { name: "Empty object", value: {} },
    { name: "Null value", value: null },
    { name: "Array with undefined", value: [1, undefined, 3] },
    {
      name: "Deep nested arrays",
      value: [[[[["deep"]]]], [[[["deep2"]]]]],
    },
    { name: "Deep object", value: createComplexObject(15) },
  ]
}

// Check for hash collisions
function checkHashCollisions(testObjects: TestObject[]): void {
  const hashes = new Map<string, string>()
  const collisions: Array<[string, string]> = []

  testObjects.forEach((obj) => {
    obj.hash = createSimpleHash(obj.value)
    if (hashes.has(obj.hash)) {
      collisions.push([obj.name, hashes.get(obj.hash)!])
    }
    hashes.set(obj.hash, obj.name)
  })

  if (collisions.length > 0) {
    throw new Error(
      "Hash collisions detected:\n" +
        collisions.map(([a, b]) => `- ${a} collides with ${b}`).join("\n")
    )
  }
}

describe("Hash Generation Tests", () => {
  let testObjects: TestObject[]

  beforeEach(() => {
    testObjects = generateTestObjects()
  })

  test("Identical objects should produce identical hashes", () => {
    const obj = createDeepObject(3, false)
    const hash1 = createSimpleHash(obj)
    const hash2 = createSimpleHash(obj)
    expect(hash1).toBe(hash2)
  })

  test("Different objects should produce different hashes", () => {
    const processed = new Set<string>()
    testObjects.forEach((obj) => {
      const hash = createSimpleHash(obj.value)
      if (processed.has(hash)) {
        throw new Error(`Hash collision detected for ${obj.name}`)
      }
      processed.add(hash)
    })
    // If we get here without throwing, the test passes
    expect(true).toBe(true)
  })

  test("Hash format should be correct", () => {
    testObjects.forEach((obj) => {
      const hash = createSimpleHash(obj.value)
      expect(typeof hash).toBe("string")
      expect(/^[0-9a-f]+$/.test(hash)).toBe(true)
    })
  })

  test("Consistent length check", () => {
    const expectedLength = 8 // Default length
    testObjects.forEach((obj) => {
      const hash = createSimpleHash(obj.value)
      expect(hash).toHaveLength(expectedLength)
    })
  })

  test("Check for hash collisions across all test objects", () => {
    expect(() => checkHashCollisions(testObjects)).not.toThrow()
  })
})

describe("Hash Performance", () => {
  test("Performance benchmark", () => {
    const startTime = performance.now()
    const iterations = 1000
    const testObj = createComplexObject(5)

    for (let i = 0; i < iterations; i++) {
      createSimpleHash(testObj)
    }

    const endTime = performance.now()
    const timePerHash = (endTime - startTime) / iterations

    console.log(`Average time per hash: ${timePerHash.toFixed(3)}ms`)
    expect(timePerHash).toBeLessThan(1) // Ensure each hash takes less than 1ms
  })
})
