/**
 * What `scripts/verify-test-fails.js` decides, apart from the git and vitest
 * runs it decides from: the base it compares with by default, how each test's
 * two results sort, and the exit code. Kept apart so that
 * `verify-test-fails-rules.test.mjs` can hold each rule to a case.
 */

/**
 * The refs `--base` defaults from: `main`, the branch 4.x is developed on, and
 * `origin/main`, which is all a clone of another branch has of it. `v3` is the
 * 3.x line, whose sources cannot load 4.x's tests. Each is read by its full
 * name, so a tag called `main` is not taken for the branch.
 */
export const BASE_LINES = [
  { name: "main", ref: "refs/heads/main" },
  { name: "origin/main", ref: "refs/remotes/origin/main" },
]

/**
 * The revision `--base` defaults to: where HEAD left the 4.x line, the newest
 * commit of {@link BASE_LINES} that HEAD contains (`git merge-base` over every
 * one that exists). So the base is the code the fix was written against,
 * neither whatever main gained since nor an older point that a stale local
 * `main` or a fork's `origin/main` would give. On main itself that is HEAD,
 * and the run compares the working tree's sources with it. `line` is the ref
 * it was found on. `undefined` when no such ref exists.
 *
 * @param {(...args: string[]) => string} git runs git in the repository and
 *   returns its trimmed output, throwing when git fails
 * @returns {{ line: string, commit: string } | undefined}
 * @throws {Error} when HEAD shares no history with any of them (a shallow
 *   clone, say)
 */
export function defaultBase(git) {
  const lines = BASE_LINES.filter(({ ref }) => {
    try {
      git("rev-parse", "--verify", "--quiet", `${ref}^{commit}`)
      return true
    } catch {
      return false
    }
  })
  if (lines.length === 0) return undefined
  const mergeBase = (...refs) => {
    try {
      return git("merge-base", "HEAD", ...refs)
    } catch {
      return undefined
    }
  }
  const commit = mergeBase(...lines.map(({ ref }) => ref))
  if (commit === undefined) {
    const names = lines.map(({ name }) => name).join(" or ")
    throw new Error(`HEAD shares no history with ${names}`)
  }
  const line = lines.find(({ ref }) => mergeBase(ref) === commit) ?? lines[0]
  return { line: line.name, commit }
}

/**
 * Sorts each test by its vitest status now (`after`) and on the base
 * (`before`), both maps of test name to status.
 *
 * Only an outright failure on the base is evidence that a test catches the
 * bug, and only a pass there that it does not. A test with no result on the
 * base (its file did not load there, a hook failed there, or it was skipped
 * there) says nothing either way, so it gets a list of its own.
 *
 * @param {Map<string, string>} after
 * @param {Map<string, string>} before
 */
export function classify(after, before) {
  const groups = {
    discriminating: [],
    bothPass: [],
    noBaseResult: [],
    failingNow: [],
    skipped: [],
  }
  for (const [name, statusAfter] of after) {
    const statusBefore = before.get(name)
    if (statusAfter === "failed") groups.failingNow.push(name)
    else if (statusAfter !== "passed") groups.skipped.push(name)
    else if (statusBefore === "failed") groups.discriminating.push(name)
    else if (statusBefore === "passed") groups.bothPass.push(name)
    else groups.noBaseResult.push(name)
  }
  return groups
}

/**
 * The exit code for {@link classify}'s groups: 0 when a test caught the bug
 * and every test has a result on the base, 1 when a test fails now, and 2
 * otherwise: no test distinguishes the fix, or a test has no result on the
 * base.
 *
 * @param {ReturnType<typeof classify>} groups
 */
export function exitCodeFor(groups) {
  if (groups.failingNow.length) return 1
  if (groups.noBaseResult.length) return 2
  if (groups.discriminating.length === 0) return 2
  return 0
}
