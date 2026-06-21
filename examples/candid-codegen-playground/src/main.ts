/**
 * Candid → Cod Codegen Playground
 *
 * Two-pane editor: Candid .did input on the left, live-generated
 * @ic-reactor/cod schema TypeScript on the right.
 */

import "./styles.css"
import { generateCodSchema } from "./codegen"
import { SAMPLES } from "./samples"
import init, { didToJs } from "@ic-reactor/parser"

// ─── State ──────────────────────────────────────────────────────────────────

let candidInput = SAMPLES.icrc1.did
let selectedSampleKey = "icrc1"
let outputCode = ""
let errorMessage = ""
let parserReady = false
let copyTimeout: ReturnType<typeof setTimeout> | null = null

// ─── Parser Init ────────────────────────────────────────────────────────────

async function initParser(): Promise<void> {
  try {
    await init()
    parserReady = true
    regenerate()
  } catch (err) {
    console.error("Failed to initialize parser:", err)
    errorMessage = "Failed to initialize WASM parser. Please reload."
    render()
  }
}

// ─── Codegen ────────────────────────────────────────────────────────────────

function regenerate(): void {
  if (!parserReady) return

  try {
    const jsOutput = didToJs(candidInput)
    outputCode = generateCodSchema(jsOutput)
    errorMessage = ""
  } catch (err) {
    outputCode = ""
    errorMessage = err instanceof Error ? err.message : "Failed to parse Candid"
  }

  render()
}

// ─── Syntax Highlighting ────────────────────────────────────────────────────

function highlightCode(code: string): string {
  // Escape HTML
  let html = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  // Comments
  html = html.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="comment">$1</span>')

  // Strings (double-quoted)
  html = html.replace(
    /(&quot;|")((?:[^"\\]|\\.)*)(&quot;|")/g,
    '<span class="str">"$2"</span>'
  )

  // Keywords
  html = html.replace(
    /\b(import|export|const|type|typeof|from)\b/g,
    '<span class="kw">$1</span>'
  )

  // c.* function calls
  html = html.replace(
    /\b(c\.(?:record|variant|opt|vec|tuple|query|update|oneway|service|text|bool|nat|nat8|nat16|nat32|nat64|int|int8|int16|int32|int64|float32|float64|principal|null|reserved|empty|blob|infer|ServiceOf))\b/g,
    '<span class="fn">$1</span>'
  )

  // Type names after "const Name" or "type Name"
  html = html.replace(
    /(<span class="kw">(?:const|type)<\/span>\s+)(\w+)/g,
    '$1<span class="type">$2</span>'
  )

  return html
}

// ─── Render ─────────────────────────────────────────────────────────────────

function render(): void {
  const app = document.getElementById("app")
  if (!app) return

  const sampleOptions = Object.entries(SAMPLES)
    .map(
      ([key, { label }]) =>
        `<option value="${key}" ${key === selectedSampleKey ? "selected" : ""}>${label}</option>`
    )
    .join("")

  app.innerHTML = `
    <header class="header">
      <div class="header-left">
        <div class="logo">Cod</div>
        <div>
          <div class="header-title">Candid → Cod Playground</div>
          <div class="header-subtitle">Live-generate @ic-reactor/cod schemas from .did definitions</div>
        </div>
      </div>
      <div class="header-right">
        <select class="sample-select" id="sample-select">
          <option value="" disabled ${!selectedSampleKey ? "selected" : ""}>Load sample…</option>
          ${sampleOptions}
        </select>
      </div>
    </header>

    <div class="toolbar">
      <div class="status-dot ${errorMessage ? "error" : ""}"></div>
      <span class="status-text">${
        !parserReady
          ? "Initializing WASM parser…"
          : errorMessage
            ? "Parse error"
            : "Ready"
      }</span>
      <div class="toolbar-spacer"></div>
      <button class="copy-btn" id="copy-btn" ${!outputCode ? "disabled" : ""}>
        <span id="copy-icon">📋</span>
        <span id="copy-label">Copy output</span>
      </button>
    </div>

    <div class="editor-container">
      <div class="editor-pane">
        <div class="pane-header">
          <span class="pane-icon">📝</span>
          <span class="pane-title">Candid Input</span>
          <span class="pane-tag">.did</span>
        </div>
        <textarea
          class="editor-textarea"
          id="candid-input"
          placeholder="Paste your Candid .did definition here…"
          spellcheck="false"
        ></textarea>
      </div>

      <div class="editor-pane">
        <div class="pane-header">
          <span class="pane-icon">⚡</span>
          <span class="pane-title">Cod Schema Output</span>
          <span class="pane-tag output">.ts</span>
        </div>
        <div id="output-content" style="flex: 1; display: flex; flex-direction: column; overflow: hidden;"></div>
      </div>
    </div>

    <footer class="footer">
      <span>Powered by <a href="https://github.com/B3Pay/ic-reactor" target="_blank" rel="noopener">@ic-reactor/cod</a></span>
      <span>IC Reactor v4</span>
    </footer>
  `

  // Programmatically populate output-content to avoid raw DOM HTML reinterpretation
  const outputContent = document.getElementById("output-content")
  if (outputContent) {
    if (errorMessage) {
      outputContent.innerHTML = `
        <div class="error-panel">
          <div class="error-icon">⚠️</div>
          <div class="error-title">Candid Parse Error</div>
          <div class="error-message" id="error-message"></div>
        </div>
      `
      const errorMsgEl = document.getElementById("error-message")
      if (errorMsgEl) {
        errorMsgEl.textContent = errorMessage
      }
    } else if (outputCode) {
      outputContent.innerHTML = `<div class="output-code" id="output-code">${highlightCode(outputCode)}</div>`
    } else {
      const msg = parserReady
        ? "Type or paste a .did definition to see the generated cod schema"
        : "Initializing parser…"
      outputContent.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">✨</div>
          <div class="empty-text" id="empty-text"></div>
        </div>
      `
      const emptyTextEl = document.getElementById("empty-text")
      if (emptyTextEl) {
        emptyTextEl.textContent = msg
      }
    }
  }

  // Bind events
  bindEvents()
}

// ─── Event Binding ──────────────────────────────────────────────────────────

let debounceTimer: ReturnType<typeof setTimeout> | null = null

function bindEvents(): void {
  const textarea = document.getElementById(
    "candid-input"
  ) as HTMLTextAreaElement | null
  const sampleSelect = document.getElementById(
    "sample-select"
  ) as HTMLSelectElement | null
  const copyBtn = document.getElementById(
    "copy-btn"
  ) as HTMLButtonElement | null

  if (textarea) {
    // Programmatically set textarea value to avoid HTML interpretation of candidInput
    textarea.value = candidInput
    textarea.addEventListener("input", () => {
      candidInput = textarea.value
      selectedSampleKey = ""

      // Debounce regeneration
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        regenerate()
      }, 300)
    })

    // Handle Tab key for indentation
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault()
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        textarea.value =
          textarea.value.substring(0, start) +
          "  " +
          textarea.value.substring(end)
        textarea.selectionStart = textarea.selectionEnd = start + 2
        candidInput = textarea.value
      }
    })
  }

  if (sampleSelect) {
    // Set initial value
    sampleSelect.value = selectedSampleKey

    sampleSelect.addEventListener("change", () => {
      const selectedKey = sampleSelect.value
      selectedSampleKey = selectedKey
      const sample = SAMPLES[selectedKey]
      if (sample) {
        candidInput = sample.did
        if (textarea) textarea.value = candidInput
        regenerate()
      }
    })
  }

  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      if (!outputCode) return

      try {
        await navigator.clipboard.writeText(outputCode)
        copyBtn.classList.add("copied")
        const iconEl = document.getElementById("copy-icon")
        const labelEl = document.getElementById("copy-label")
        if (iconEl) iconEl.textContent = "✅"
        if (labelEl) labelEl.textContent = "Copied!"

        if (copyTimeout) clearTimeout(copyTimeout)
        copyTimeout = setTimeout(() => {
          copyBtn.classList.remove("copied")
          if (iconEl) iconEl.textContent = "📋"
          if (labelEl) labelEl.textContent = "Copy output"
        }, 2000)
      } catch {
        // Fallback
        const textarea = document.createElement("textarea")
        textarea.value = outputCode
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand("copy")
        document.body.removeChild(textarea)
      }
    })
  }
}

// ─── Boot ───────────────────────────────────────────────────────────────────

render()
initParser()
