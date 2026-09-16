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
 * Nothing here follows a link at the destination. replaceFile puts a new file in
 * place of whatever entry holds the name. createFile and copyToNewFile make a
 * new file and fail if any entry already holds the name, a dangling link
 * included.
 */

import { randomBytes } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

/**
 * Write `content` to `filePath`, replacing the entry already there.
 *
 * The content goes to a new file in the same directory, and a rename then moves
 * it onto `filePath`. `rename(2)` replaces a link at the destination instead of
 * following it, and a reader sees the old file or the new one, never a partial
 * write. `declarations/` is staged and swapped the same way.
 */
export function replaceFile(filePath: string, content: string): void {
  // Dot-prefixed and not ending in `.ts`, so the project does not compile a
  // file that a crash leaves behind.
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath).replace(/^\./, "")}.tmp-${randomBytes(6).toString("hex")}`
  )

  // `wx` fails on any existing entry, so the temporary name cannot be a link
  // either, and the cleanup below only removes a file this call created.
  const fd = fs.openSync(tempPath, "wx")
  try {
    try {
      fs.writeFileSync(fd, content)
    } finally {
      fs.closeSync(fd)
    }
    fs.renameSync(tempPath, filePath)
  } catch (error) {
    fs.rmSync(tempPath, { force: true })
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
