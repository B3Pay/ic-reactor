/**
 * Saves `text` as a file named `filename`. Browser only: call it from an
 * event handler, never during render.
 */
export function downloadText(
  filename: string,
  text: string,
  type = "text/plain;charset=utf-8"
): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.rel = "noopener"
  document.body.append(link)
  link.click()
  link.remove()
  // Revoked on the next task: some browsers start the download only after
  // the click handler returns.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * A file name from canister-provided text: anything but letters, digits,
 * dots, dashes and underscores becomes one dash, and leading or trailing
 * dots and dashes go (no hidden files, no "..").
 */
export function safeFileName(text: string): string {
  const cleaned = text
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
  return cleaned === "" ? "canister" : cleaned.slice(0, 80)
}
