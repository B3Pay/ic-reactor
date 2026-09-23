/**
 * Writes into a canister's output directory.
 *
 * The pipeline checks that the output directory resolves inside the project,
 * but the entries inside that directory come from the repository too.
 * `writeFileSync` and `copyFileSync` open their destination by path and follow
 * a symbolic link there. A link committed at a generated file's path sent the
 * write outside the project, a dangling link created a new file wherever it
 * pointed, and the pipeline still reported success.
 *
 * Nothing here follows a link at the destination. replaceFile and replaceFiles
 * put a new file in place of whatever entry holds the name. createFile and
 * copyToNewFile make a new file and fail if any entry already holds the name, a
 * dangling link included.
 *
 * replaceFile and replaceFiles leave a regular file alone when it already holds
 * the bytes they would write. Every write wakes `tsc --watch`, the bundler's
 * watcher and the editor, even when the bytes are the same, and the pipeline
 * regenerates every file on every run.
 */

import { randomBytes } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

/**
 * Whether `filePath` is a regular file whose bytes are exactly `content`.
 *
 * A link is never a match, even when its target holds the same bytes, so the
 * caller replaces it rather than leaving a generated path that points elsewhere.
 */
function holdsContent(filePath: string, content: string): boolean {
  const expected = Buffer.from(content)
  try {
    const stat = fs.lstatSync(filePath)
    if (!stat.isFile() || stat.size !== expected.length) return false
    return fs.readFileSync(filePath).equals(expected)
  } catch {
    return false
  }
}

/**
 * Write `content` to `filePath`, replacing the entry already there, unless that
 * entry is a regular file that already holds exactly `content`.
 */
export function replaceFile(filePath: string, content: string): void {
  replaceFiles([[filePath, content]])
}

/**
 * Write each `[filePath, content]` pair as replaceFile does.
 *
 * Each new file is written to a temporary name in its destination's directory,
 * and the renames that move them onto their paths start only once every one is
 * written, so a failed write replaces nothing. `rename(2)` replaces a link at
 * the destination instead of following it, and a reader sees the old file or
 * the new one, never a partial write.
 */
export function replaceFiles(
  files: ReadonlyArray<readonly [filePath: string, content: string]>
): void {
  const staged: { tempPath: string; filePath: string }[] = []

  try {
    for (const [filePath, content] of files) {
      if (holdsContent(filePath, content)) continue

      // Dot-prefixed and not ending in `.ts`, so the project does not compile a
      // file that a crash leaves behind.
      const tempPath = path.join(
        path.dirname(filePath),
        `.${path.basename(filePath).replace(/^\./, "")}.tmp-${randomBytes(6).toString("hex")}`
      )

      // `wx` fails on any existing entry, so the temporary name cannot be a
      // link either, and the cleanup below only removes files this call made.
      const fd = fs.openSync(tempPath, "wx")
      staged.push({ tempPath, filePath })
      try {
        fs.writeFileSync(fd, content)
      } finally {
        fs.closeSync(fd)
      }
    }

    for (const { tempPath, filePath } of staged) {
      fs.renameSync(tempPath, filePath)
    }
  } catch (error) {
    // A temporary file that was already renamed is gone, and `force` skips it.
    for (const { tempPath } of staged) fs.rmSync(tempPath, { force: true })
    throw error
  }
}

/**
 * Create `filePath` with `content`, and fail if any entry holds the name.
 *
 * This is for a file the user owns once it exists, where replacing a link would
 * be as wrong as writing through it. Callers check `fs.existsSync` first, which
 * follows links and reports a dangling one as missing. The `wx` flag makes the
 * open fail on that link instead of creating the file it points to.
 */
export function createFile(filePath: string, content: string): void {
  try {
    fs.writeFileSync(filePath, content, { flag: "wx" })
  } catch (error) {
    throw explainExistingEntry(error, filePath)
  }
}

/**
 * Copy `source` to a new file at `destination`, and fail if any entry holds
 * that name, a dangling link included.
 */
export function copyToNewFile(source: string, destination: string): void {
  try {
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL)
  } catch (error) {
    throw explainExistingEntry(error, destination)
  }
}

/**
 * Name the link when an exclusive create fails on one.
 *
 * The bare EEXIST says the file already exists, about a path the caller has
 * just seen as missing.
 */
function explainExistingEntry(error: unknown, filePath: string): unknown {
  if ((error as NodeJS.ErrnoException | undefined)?.code !== "EEXIST") {
    return error
  }

  let linkTarget: string
  try {
    linkTarget = fs.readlinkSync(filePath)
  } catch {
    // Not a link. Another process created the file after the caller looked.
    return error
  }

  return new Error(
    `Refusing to create ${filePath} because it is a symbolic link to ${linkTarget}. ` +
      `Codegen does not write through links, since a link can point outside the ` +
      `project. Remove the link and run codegen again.`,
    { cause: error }
  )
}
