/**
 * Tests of the stack check (scripts/check-stack.mjs): every candid-core pin in
 * a tracked package.json, every `@candid-core/<name>@<version>` and every
 * peer-table "exactly" in a Markdown, MDX or text file, and the two pins in
 * code are the versions of stack.json, and `--write` rewrites what disagrees
 * and nothing else.
 *
 * Each case runs the check on a repository built for it under the system temp
 * directory, so a rewrite can only touch the copy. The last cases run it on
 * this repository's own tree, which must agree with its manifest.
 *
 * Run by `pnpm test:scripts`; it needs `git` on the PATH.
 */
import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { after, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import {
  CODE_PINS,
  MANIFEST,
  checkStack,
  readManifest,
} from "./check-stack.mjs"

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(scriptsDir, "..")

// A GIT_DIR or GIT_INDEX_FILE inherited from a git hook would point the
// fixtures' `git add`, and the check's `git ls-files`, at this repository.
for (const name of Object.keys(process.env)) {
  if (name.startsWith("GIT_")) delete process.env[name]
}

const temps = []
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

const STACK = {
  "candid-core": {
    "@candid-core/schema": "0.4.0",
    "@candid-core/cli": "0.3.0",
  },
  frozen: ["evals/"],
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`

/** A package.json as the tree writes them: two-space JSON, one key a line. */
const manifest = (fields) => json({ name: "fixture", private: true, ...fields })

/** The tree every case starts from: every pin and mention agrees. */
const AGREEING = {
  [MANIFEST]: json(STACK),
  "package.json": manifest({
    devDependencies: { "@candid-core/schema": "0.4.0" },
  }),
  "packages/core/package.json": manifest({
    peerDependencies: { "@candid-core/schema": "0.4.0" },
    peerDependenciesMeta: { "@candid-core/schema": { optional: false } },
    devDependencies: { "@candid-core/schema": "0.4.0" },
  }),
  "examples/app/package.json": manifest({
    dependencies: { "@candid-core/schema": "0.4.0" },
    devDependencies: { "@candid-core/cli": "0.3.0" },
  }),
  "README.md":
    "npm install --save-exact @candid-core/schema@0.4.0\nnpm install --save-dev --save-exact @candid-core/cli@0.3.0\n",
  "evals/README.md":
    "Each condition keeps the versions it was measured with.\n",
}

/** A repository holding `files`, all of them tracked unless `untracked` names them. */
function repository(files, { untracked = [], links = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), "check-stack-test-"))
  temps.push(root)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  for (const [path, target] of Object.entries(links)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    symlinkSync(target, join(root, path))
  }
  execFileSync("git", ["init", "-q"], { cwd: root })
  const tracked = [...Object.keys(files), ...Object.keys(links)].filter(
    (path) => !untracked.includes(path)
  )
  // -f: a global excludes file that lists a fixture's path (CHANGELOG.md,
  // say) must not keep it out.
  execFileSync("git", ["add", "-f", "--", ...tracked], { cwd: root })
  return root
}

const read = (root, path) => readFileSync(join(root, path), "utf8")

/** Runs the check on a fixture repository, which holds no code pins. */
const check = (root, options = {}) =>
  checkStack(root, { codePins: [], ...options })

/** The problems as `file:line message`, for an exact comparison. */
const listed = (result) =>
  result.problems.map(({ file, line, message }) => `${file}:${line} ${message}`)

/** A fixture repository with one more file, checked; its problems listed. */
const problemsWith = (files) =>
  listed(check(repository({ ...AGREEING, ...files })))

describe("package.json pins", () => {
  it("passes a tree whose pins and mentions all agree with the manifest", () => {
    const result = check(repository(AGREEING))
    assert.deepEqual(listed(result), [])
    assert.deepEqual(result.checked, { pins: 5, mentions: 2 })
  })

  it("names the file, the line and both versions of a pin that disagrees", () => {
    assert.deepEqual(
      problemsWith({
        "examples/app/package.json": manifest({
          dependencies: { "@candid-core/schema": "0.4.0" },
          devDependencies: { "@candid-core/cli": "0.2.0" },
        }),
      }),
      [
        'examples/app/package.json:8 @candid-core/cli is "0.2.0"; stack.json pins 0.3.0',
      ]
    )
  })

  it("refuses a range even when it admits the manifest's version", () => {
    assert.deepEqual(
      problemsWith({
        "packages/core/package.json": manifest({
          peerDependencies: { "@candid-core/schema": "^0.4.0" },
        }),
      }),
      [
        'packages/core/package.json:5 @candid-core/schema is "^0.4.0"; stack.json pins 0.4.0',
      ]
    )
  })

  it("holds overrides, keyed by the name, a parent selector or a range selector", () => {
    assert.deepEqual(
      problemsWith({
        "package.json": manifest({
          devDependencies: { "@candid-core/schema": "0.4.0" },
          pnpm: {
            overrides: {
              "@candid-core/schema": "0.3.0",
              "@candid-core/cli>@candid-core/schema": "0.3.0",
              "@candid-core/schema@<0.4.0": "0.3.0",
              "@candid-core/schema@>=0.3.0 <0.4.0": "0.3.0",
            },
          },
        }),
      }),
      [
        'package.json:9 @candid-core/schema is "0.3.0"; stack.json pins 0.4.0',
        'package.json:10 @candid-core/schema is "0.3.0"; stack.json pins 0.4.0',
        'package.json:11 @candid-core/schema is "0.3.0"; stack.json pins 0.4.0',
        'package.json:12 @candid-core/schema is "0.3.0"; stack.json pins 0.4.0',
      ]
    )
  })

  it("reads the dep of a name@range>dep key, not the name", () => {
    assert.deepEqual(
      problemsWith({
        "package.json": manifest({
          devDependencies: { "@candid-core/schema": "0.4.0" },
          pnpm: {
            overrides: {
              "@candid-core/schema@0.3.0>@noble/hashes": "1.8.0",
              "@candid-core/schema@0.3.0>@candid-core/cli": "0.2.0",
            },
          },
        }),
      }),
      ['package.json:10 @candid-core/cli is "0.2.0"; stack.json pins 0.3.0']
    )
  })

  it("holds a script's npx and an npm: alias, but not an override's selector", () => {
    assert.deepEqual(
      problemsWith({
        "examples/app/package.json": manifest({
          scripts: { gen: "npx -y @candid-core/cli@0.2.0 gen app.did -o src" },
          dependencies: {
            "@candid-core/schema": "0.4.0",
            "schema-alias": "npm:@candid-core/schema@0.3.0",
          },
          devDependencies: { "@candid-core/cli": "0.3.0" },
          overrides: { "@candid-core/schema@0.3.0": "0.4.0" },
        }),
      }),
      [
        'examples/app/package.json:9 @candid-core/schema is "0.3.0"; stack.json pins 0.4.0',
        'examples/app/package.json:5 @candid-core/cli is "0.2.0"; stack.json pins 0.3.0',
      ]
    )
  })

  it("leaves a longer name, the name field and peerDependenciesMeta alone", () => {
    assert.deepEqual(
      problemsWith({
        "tests/fake-cli/package.json": json({
          name: "@candid-core/cli",
          dependencies: { "@candid-core/schema-extra": "1.0.0" },
        }),
      }),
      []
    )
  })
})

describe("mentions in Markdown, MDX and text files", () => {
  it("holds an install line, a sentence and a text file to the manifest", () => {
    assert.deepEqual(
      problemsWith({
        "docs/guide.mdx":
          "Install the pair:\n\n```sh\nnpm install --save-exact @candid-core/schema@0.3.0\n```\n",
        "packages/core/README.md":
          "The generator (`@candid-core/cli@0.2.0-beta.1`) pairs with it.\n",
        "packages/core/llms.txt":
          "Install @candid-core/schema@0.3.0 with --save-exact.\n",
      }),
      [
        'docs/guide.mdx:4 @candid-core/schema is "0.3.0"; stack.json pins 0.4.0',
        'packages/core/README.md:1 @candid-core/cli is "0.2.0-beta.1"; stack.json pins 0.3.0',
        'packages/core/llms.txt:1 @candid-core/schema is "0.3.0"; stack.json pins 0.4.0',
      ]
    )
  })

  it("refuses a range, a dist-tag and a CDN URL's version", () => {
    assert.deepEqual(
      problemsWith({
        "docs/cdn.md": [
          "npm i @candid-core/schema@^0.4.0",
          "npm i @candid-core/cli@latest",
          "import { c } from 'https://cdn.jsdelivr.net/npm/@candid-core/schema@0.3.0/dist/index.js'",
          'npm i "@candid-core/cli@>=0.3.0"',
          "",
        ].join("\n"),
      }),
      [
        'docs/cdn.md:1 @candid-core/schema is "^0.4.0"; stack.json pins 0.4.0',
        'docs/cdn.md:2 @candid-core/cli is "latest"; stack.json pins 0.3.0',
        'docs/cdn.md:3 @candid-core/schema is "0.3.0"; stack.json pins 0.4.0',
        'docs/cdn.md:4 @candid-core/cli is ">=0.3.0"; stack.json pins 0.3.0',
      ]
    )
  })

  it("reads a version up to the punctuation that ends a sentence", () => {
    assert.deepEqual(
      problemsWith({
        "docs/prose.md":
          "Pin @candid-core/schema@0.4.0. Then **@candid-core/cli@0.3.0**: done, (`@candid-core/cli@0.3.0`).\n",
      }),
      []
    )
  })

  it("ends a version at a curly quote, a dash or a strikethrough", () => {
    assert.deepEqual(
      problemsWith({
        "docs/typeset.md":
          "Say \u201c@candid-core/cli@0.3.0\u201d. Pin @candid-core/schema@0.4.0\u2014the pair. Not ~~@candid-core/cli@0.3.0~~.\n",
      }),
      []
    )
  })

  it("holds a peer-table row that says exactly", () => {
    assert.deepEqual(
      problemsWith({
        "docs/packages/core.mdx": [
          "| Peer                  | Range                           |",
          "| --------------------- | ------------------------------- |",
          "| `@candid-core/schema` | exactly `0.3.0`: the module ... |",
          "| `@icp-sdk/core`       | exactly `6.1.0`                 |",
          "",
        ].join("\n"),
      }),
      [
        'docs/packages/core.mdx:3 @candid-core/schema is "0.3.0"; stack.json pins 0.4.0',
      ]
    )
  })

  it("reads a row's version only from the row's own line, and only a version", () => {
    assert.deepEqual(
      problemsWith({
        "docs/peers.md": [
          "`@candid-core/schema` is a peer of core.",
          "Its other peers are exactly `6.1.0` and newer.",
          "`@candid-core/schema` pairs exactly `@candid-core/cli@0.3.0`.",
          "",
        ].join("\n"),
      }),
      []
    )
  })

  it("leaves prose about one release, other packages and an address alone", () => {
    assert.deepEqual(
      problemsWith({
        "docs/other.md": [
          "`@candid-core/cli` 0.2.0 reads a file by its exact name.",
          "@tanstack/query-core@5.62.0, @candid-core/profile@0.1.0 and @candid-core/schema-extra@1.0.0.",
          "Mail me@candid-core/schema@0.1.0 is not a package.",
          "",
        ].join("\n"),
      }),
      []
    )
  })
})

describe("what keeps its versions", () => {
  it("leaves changelogs, frozen paths, untracked files and symlinks alone", () => {
    const root = repository(
      {
        ...AGREEING,
        "CHANGELOG.md": "npm install --save-exact @candid-core/schema@0.3.0\n",
        "packages/core/CHANGELOG.md":
          "Repinned from `@candid-core/cli@0.2.0`.\n",
        "docs/changelog.mdx": "Moved from @candid-core/cli@0.2.0.\n",
        "evals/conditions/thin/package.json": manifest({
          dependencies: { "@candid-core/schema": "0.2.0" },
        }),
        "evals/README.md": "npm install @candid-core/schema@0.2.0\n",
        "docs/frozen-note.md": "npm install @candid-core/schema@0.1.0\n",
        "scratch/package.json": manifest({
          dependencies: { "@candid-core/schema": "0.1.0" },
        }),
        [MANIFEST]: json({
          ...STACK,
          frozen: ["evals/", "docs/frozen-note.md"],
        }),
      },
      {
        untracked: ["scratch/package.json"],
        links: { "docs/eval-notes.md": "../evals/README.md" },
      }
    )
    assert.deepEqual(listed(check(root)), [])
  })

  it("freezes a file entry by its exact path, not as a prefix", () => {
    assert.deepEqual(
      listed(
        check(
          repository({
            ...AGREEING,
            [MANIFEST]: json({ ...STACK, frozen: ["evals/", "docs/note.md"] }),
            "docs/note.md": "npm install @candid-core/schema@0.1.0\n",
            "docs/note.md.txt": "npm install @candid-core/schema@0.1.0\n",
          })
        )
      ),
      [
        'docs/note.md.txt:1 @candid-core/schema is "0.1.0"; stack.json pins 0.4.0',
      ]
    )
  })

  it("skips a tracked file deleted from the working tree", () => {
    const root = repository({
      ...AGREEING,
      "docs/gone.md": "npm install @candid-core/schema@0.1.0\n",
    })
    unlinkSync(join(root, "docs/gone.md"))
    assert.deepEqual(listed(check(root)), [])
  })

  it("fails a frozen path that holds no tracked file", () => {
    assert.deepEqual(
      listed(
        check(
          repository({
            ...AGREEING,
            [MANIFEST]: json({ ...STACK, frozen: ["evals"] }),
          })
        )
      ),
      [
        'stack.json:7 the frozen path "evals" holds no tracked file; a directory ends in "/"',
      ]
    )
  })

  it("fails a package of the manifest that only a frozen path pins", () => {
    const root = repository({
      [MANIFEST]: json({
        ...STACK,
        "candid-core": {
          ...STACK["candid-core"],
          "@candid-core/extra": "1.0.0",
        },
      }),
      "package.json": manifest({
        devDependencies: {
          "@candid-core/schema": "0.4.0",
          "@candid-core/cli": "0.3.0",
        },
      }),
      "evals/package.json": manifest({
        dependencies: { "@candid-core/extra": "1.0.0" },
      }),
    })
    assert.deepEqual(listed(check(root)), [
      "stack.json:5 no package.json outside the frozen paths pins @candid-core/extra; remove it from stack.json or pin it",
    ])
  })
})

describe("pins in code", () => {
  const codePins = [
    {
      file: "src/generate.ts",
      name: "@candid-core/cli",
      pattern: /(export const CLI_VERSION = ")([^"]*)(")/g,
    },
  ]

  it("holds a pin in code and rewrites it", () => {
    const root = repository({
      ...AGREEING,
      "src/generate.ts": 'export const CLI_VERSION = "0.2.0"\n',
    })
    assert.deepEqual(listed(check(root, { codePins })), [
      'src/generate.ts:1 @candid-core/cli is "0.2.0"; stack.json pins 0.3.0',
    ])
    check(root, { codePins, write: true })
    assert.equal(
      read(root, "src/generate.ts"),
      'export const CLI_VERSION = "0.3.0"\n'
    )
  })

  it("fails a code pin whose pattern no longer matches once, or whose file is gone", () => {
    const twice = repository({
      ...AGREEING,
      "src/generate.ts":
        'export const CLI_VERSION = "0.3.0"\nexport const CLI_VERSION = "0.3.0"\n',
    })
    assert.deepEqual(listed(check(twice, { codePins })), [
      "src/generate.ts:0 the pin of @candid-core/cli matches 2 times, not once; update CODE_PINS in scripts/check-stack.mjs",
    ])
    const refactored = repository({
      ...AGREEING,
      "src/generate.ts": 'export const CLI = { version: "0.2.0" }\n',
    })
    assert.deepEqual(listed(check(refactored, { codePins })), [
      "src/generate.ts:0 the pin of @candid-core/cli matches 0 times, not once; update CODE_PINS in scripts/check-stack.mjs",
    ])
    assert.deepEqual(listed(check(repository(AGREEING), { codePins })), [
      "src/generate.ts:0 holds the pin of @candid-core/cli but is not a tracked file; update CODE_PINS in scripts/check-stack.mjs",
    ])
  })
})

describe("--write", () => {
  it("rewrites every pin and mention that disagrees, and no other byte", () => {
    const stale = {
      ...AGREEING,
      "examples/app/package.json": manifest({
        dependencies: { "@candid-core/schema": "0.3.0" },
        devDependencies: { "@candid-core/cli": "^0.2.0" },
      }),
      "README.md":
        "npm install --save-exact @candid-core/schema@0.3.0\nnpm install --save-dev --save-exact @candid-core/cli@0.3.0\n",
      "docs/cdn.md":
        "See https://cdn.jsdelivr.net/npm/@candid-core/schema@0.3.0/dist/index.js.\n",
      "docs/core.mdx":
        "| `@candid-core/schema` | exactly `0.3.0`: the module imports it |\n",
      "CHANGELOG.md": "npm install --save-exact @candid-core/schema@0.3.0\n",
      "evals/package.json": manifest({
        dependencies: { "@candid-core/schema": "0.2.0" },
      }),
    }
    const root = repository(stale)
    const result = check(root, { write: true })
    assert.equal(result.problems.length, 5)
    assert.deepEqual(result.written.sort(), [
      "README.md",
      "docs/cdn.md",
      "docs/core.mdx",
      "examples/app/package.json",
    ])
    assert.equal(
      read(root, "examples/app/package.json"),
      AGREEING["examples/app/package.json"]
    )
    assert.equal(read(root, "README.md"), AGREEING["README.md"])
    assert.equal(
      read(root, "docs/cdn.md"),
      "See https://cdn.jsdelivr.net/npm/@candid-core/schema@0.4.0/dist/index.js.\n"
    )
    assert.equal(
      read(root, "docs/core.mdx"),
      "| `@candid-core/schema` | exactly `0.4.0`: the module imports it |\n"
    )
    assert.equal(read(root, "CHANGELOG.md"), stale["CHANGELOG.md"])
    assert.equal(read(root, "evals/package.json"), stale["evals/package.json"])
    assert.deepEqual(listed(check(root)), [])
  })

  it("keeps a package.json valid: an escaped quote ends a version", () => {
    const script = (version) =>
      `sh -c "npx -y @candid-core/cli@${version} gen app.did"`
    const app = (version) =>
      manifest({
        scripts: { gen: script(version) },
        devDependencies: { "@candid-core/cli": "0.3.0" },
      })
    assert.deepEqual(
      problemsWith({ "examples/app/package.json": app("0.3.0") }),
      []
    )
    const root = repository({
      ...AGREEING,
      "examples/app/package.json": app("0.2.0"),
    })
    check(root, { write: true })
    assert.equal(read(root, "examples/app/package.json"), app("0.3.0"))
  })

  it("reports what is not a version or a range and leaves it as it was", () => {
    const stale = {
      ...AGREEING,
      "packages/core/package.json": manifest({
        peerDependencies: { "@candid-core/schema": "catalog:" },
        devDependencies: {
          "@candid-core/schema": "workspace:*",
          "schema-alias": "npm:@candid-core/schema@0.3.0 || 0.5.0",
        },
      }),
      "docs/tarball.md": "npm install ./@candid-core/schema@0.3.0.tgz\n",
    }
    const root = repository(stale)
    const result = check(root, { write: true })
    assert.deepEqual(listed(result), [
      'docs/tarball.md:1 @candid-core/schema is "0.3.0.tgz"; stack.json pins 0.4.0, and only a version, a range or a dist-tag is rewritten, so change this one by hand',
      'packages/core/package.json:5 @candid-core/schema is "catalog:"; stack.json pins 0.4.0, and only a version, a range or a dist-tag is rewritten, so change this one by hand',
      'packages/core/package.json:8 @candid-core/schema is "workspace:*"; stack.json pins 0.4.0, and only a version, a range or a dist-tag is rewritten, so change this one by hand',
      'packages/core/package.json:9 @candid-core/schema is "0.3.0 || 0.5.0"; stack.json pins 0.4.0, and only a version, a range or a dist-tag is rewritten, so change this one by hand',
    ])
    assert.ok(result.problems.every(({ fixable }) => !fixable))
    assert.deepEqual(result.written, [])
  })

  it("does not write a package.json the rewrite would leave invalid JSON", () => {
    // A code pin that reads a number: its rewrite puts a bare 0.3.0 in JSON.
    const codePins = [
      {
        file: "examples/app/package.json",
        name: "@candid-core/cli",
        pattern: /("cliMajor": )(\d+)(,)/g,
      },
    ]
    const app = manifest({
      cliMajor: 0,
      devDependencies: { "@candid-core/cli": "0.3.0" },
    })
    const root = repository({ ...AGREEING, "examples/app/package.json": app })
    const result = check(root, { codePins, write: true })
    assert.deepEqual(
      listed(result).filter((line) => line.includes("invalid JSON")),
      [
        "examples/app/package.json:0 the rewrite would leave it invalid JSON, so it is left as it was; change it by hand",
      ]
    )
    assert.deepEqual(result.written, [])
    assert.equal(read(root, "examples/app/package.json"), app)
  })

  it("writes nothing without --write", () => {
    const stale = {
      ...AGREEING,
      "README.md": "npm install --save-exact @candid-core/schema@0.3.0\n",
    }
    const root = repository(stale)
    assert.equal(check(root).problems.length, 1)
    assert.equal(read(root, "README.md"), stale["README.md"])
  })
})

describe("readManifest", () => {
  const refused = [
    ["text that is not JSON", "{ candid-core: }", /is not JSON/],
    ["a list", json([STACK]), /must hold an object/],
    [
      "a range",
      json({ "candid-core": { "@candid-core/schema": "^0.4.0" } }),
      /exact stable version/,
    ],
    [
      "a prerelease",
      json({ "candid-core": { "@candid-core/schema": "0.5.0-beta.1" } }),
      /exact stable version/,
    ],
    [
      "build metadata",
      json({ "candid-core": { "@candid-core/schema": "0.4.0+1" } }),
      /exact stable version/,
    ],
    [
      "a leading zero",
      json({ "candid-core": { "@candid-core/schema": "0.04.0" } }),
      /exact stable version/,
    ],
    [
      "an upper-case name",
      json({ "candid-core": { "@candid-core/sChema": "0.4.0" } }),
      /scoped package name/,
    ],
    ["no packages", json({ "candid-core": {} }), /at least one package/],
    [
      "an unscoped name",
      json({ "candid-core": { "candid-core": "0.1.0" } }),
      /scoped package name/,
    ],
    [
      "an unknown key",
      json({ ...STACK, crate: { "candid-core": "0.1.0" } }),
      /unknown key "crate"/,
    ],
    [
      "a frozen that is not a list",
      json({ ...STACK, frozen: "evals/" }),
      /relative to the repository root/,
    ],
    [
      "an empty frozen path",
      json({ ...STACK, frozen: [""] }),
      /relative to the repository root/,
    ],
    [
      "an absolute frozen path",
      json({ ...STACK, frozen: ["/evals/"] }),
      /relative to the repository root/,
    ],
    [
      "a frozen path that climbs out",
      json({ ...STACK, frozen: ["../evals/"] }),
      /relative to the repository root/,
    ],
    [
      "a frozen path that starts ./",
      json({ ...STACK, frozen: ["./evals/"] }),
      /relative to the repository root/,
    ],
    [
      "a frozen path with an empty part",
      json({ ...STACK, frozen: ["evals//"] }),
      /relative to the repository root/,
    ],
  ]
  for (const [what, text, error] of refused) {
    it(`refuses ${what}`, () => {
      const root = repository({ [MANIFEST]: text })
      assert.throws(() => readManifest(root), error)
    })
  }

  it("accepts keys that start with $ and no frozen list", () => {
    const root = repository({
      [MANIFEST]: json({
        $comment: "notes",
        "candid-core": { "@candid-core/schema": "0.5.0" },
      }),
    })
    const { pins, frozen } = readManifest(root)
    assert.deepEqual([...pins], [["@candid-core/schema", "0.5.0"]])
    assert.deepEqual(frozen, [])
  })
})

describe("the command", () => {
  /** Runs a copy of the script as `scripts/check-stack.mjs` of `root`. */
  function run(root, args = []) {
    mkdirSync(join(root, "scripts"), { recursive: true })
    writeFileSync(
      join(root, "scripts", "check-stack.mjs"),
      readFileSync(join(scriptsDir, "check-stack.mjs"))
    )
    // The copy holds the real CODE_PINS, so each fixture tracks a stand-in of
    // both files.
    return spawnSync(process.execPath, ["scripts/check-stack.mjs", ...args], {
      cwd: root,
      encoding: "utf8",
    })
  }

  const CODE_FILES = {
    "packages/vite-plugin/src/generate.ts":
      'export const CANDID_CORE_CLI_VERSION = "0.3.0"\n',
    "scripts/export-budget.mjs":
      'export const FOREIGN = [{\n  package: "@candid-core/schema",\n  from: "packages/core",\n  pin: "0.4.0",\n}]\n',
  }

  it("exits 0 and counts what it checked on a tree that agrees", () => {
    const result = run(repository({ ...AGREEING, ...CODE_FILES }))
    assert.equal(result.status, 0, result.stderr)
    assert.match(
      result.stdout,
      /^7 pins and 2 mentions agree with stack\.json \(@candid-core\/schema 0\.4\.0, @candid-core\/cli 0\.3\.0\)\.$/m
    )
  })

  it("exits 1 and names each disagreement", () => {
    const result = run(
      repository({
        ...AGREEING,
        ...CODE_FILES,
        "README.md": "npm install --save-exact @candid-core/schema@0.3.0\n",
      })
    )
    assert.equal(result.status, 1)
    assert.match(
      result.stderr,
      /^README\.md:1: @candid-core\/schema is "0\.3\.0"; stack\.json pins 0\.4\.0$/m
    )
    assert.match(result.stderr, /Run `pnpm sync:stack`, then `pnpm install`\./)
  })

  it("with --write, exits 0 once it has rewritten what disagrees", () => {
    const root = repository({
      ...AGREEING,
      ...CODE_FILES,
      "README.md": "npm install --save-exact @candid-core/schema@0.3.0\n",
    })
    const result = run(root, ["--write"])
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /^rewrote README\.md$/m)
    assert.equal(
      read(root, "README.md"),
      "npm install --save-exact @candid-core/schema@0.4.0\n"
    )
  })

  it("with --write, exits 1 on what only a change to the manifest can fix", () => {
    const result = run(
      repository({
        ...CODE_FILES,
        [MANIFEST]: json(STACK),
        "package.json": manifest({
          devDependencies: { "@candid-core/schema": "0.4.0" },
        }),
      }),
      ["--write"]
    )
    assert.equal(result.status, 1)
    assert.match(
      result.stderr,
      /^stack\.json:4: no package\.json outside the frozen paths pins @candid-core\/cli/m
    )
  })

  it("exits 1 on a manifest it cannot read, and 2 on an unknown argument", () => {
    const broken = run(repository({ ...AGREEING, [MANIFEST]: "{" }))
    assert.equal(broken.status, 1)
    assert.match(broken.stderr, /^::error::stack\.json is not JSON/m)
    const unknown = run(repository({ ...AGREEING, ...CODE_FILES }), ["--fix"])
    assert.equal(unknown.status, 2)
    assert.match(unknown.stderr, /^Unknown argument: --fix$/m)
  })
})

describe("this repository", () => {
  it("agrees with its own stack.json", () => {
    const result = checkStack(repoRoot)
    assert.deepEqual(listed(result), [])
    assert.ok(result.checked.pins > CODE_PINS.length, "no package.json pins")
  })

  it("matches each pin in code exactly once", () => {
    for (const { file, pattern } of CODE_PINS) {
      const text = readFileSync(join(repoRoot, file), "utf8")
      assert.equal([...text.matchAll(pattern)].length, 1, file)
    }
  })
})
