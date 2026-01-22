import { ClientManager } from "@ic-reactor/core"
import { MetadataDisplayReactor, ArgumentField } from "@ic-reactor/candid"
import { QueryClient } from "@tanstack/query-core"
import { NumberArgumentField } from "@ic-reactor/candid/dist/visitor/arguments"

const clientManager = new ClientManager({
  queryClient: new QueryClient(),
  withProcessEnv: true,
})

let reactor: MetadataDisplayReactor

const canisterIdInput = document.getElementById(
  "canister-id"
) as HTMLInputElement
const connectBtn = document.getElementById("connect-btn") as HTMLButtonElement
const methodsContainer = document.getElementById(
  "methods-container"
) as HTMLDivElement
const methodSelect = document.getElementById(
  "method-select"
) as HTMLSelectElement
const formContainer = document.getElementById(
  "form-container"
) as HTMLDivElement
const callBtn = document.getElementById("call-btn") as HTMLButtonElement
const resultContainer = document.getElementById(
  "result-container"
) as HTMLDivElement
const resultDisplay = document.getElementById(
  "result-display"
) as HTMLPreElement

await clientManager.initialize()

connectBtn.addEventListener("click", async () => {
  const canisterId = canisterIdInput.value
  if (!canisterId) return

  connectBtn.disabled = true
  connectBtn.textContent = "Connecting..."

  try {
    reactor = new MetadataDisplayReactor({
      canisterId,
      clientManager,
      name: "DynamicActor",
    })

    await reactor.initialize()

    const methods = reactor.getMethodNames()
    methodSelect.innerHTML = methods
      .map((m) => `<option value="${m}">${m}</option>`)
      .join("")

    methodsContainer.style.display = "block"
    updateUI()

    connectBtn.textContent = "Connected!"
  } catch (err) {
    console.error(err)
    alert("Failed to connect: " + err)
    connectBtn.disabled = false
    connectBtn.textContent = "Connect & Fetch IDL"
  }
})

methodSelect.addEventListener("change", updateUI)

function updateUI() {
  const methodName = methodSelect.value
  const argMeta = reactor.getArgumentMeta(methodName)
  const resultMeta = reactor.getResultMeta(methodName)

  if (!argMeta || !resultMeta) return

  // Render Metadata View
  formContainer.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
      <div style="max-height: 200px; overflow: auto; background: #111; padding: 10px; font-size: 12px;">
        <strong>Arg Metadata:</strong>
        <pre>${JSON.stringify(argMeta, replacer, 2)}</pre>
      </div>
      <div style="max-height: 200px; overflow: auto; background: #111; padding: 10px; font-size: 12px;">
        <strong>Result Metadata:</strong>
        <pre>${JSON.stringify(resultMeta, replacer, 2)}</pre>
      </div>
    </div>
    
    <div id="dynamic-form" style="padding: 20px; background: #1a1a1a; margin-bottom: 20px;">
      <h4>Interactive Form</h4>
      <div id="inputs-area"></div>
    </div>
  `

  const inputsArea = document.getElementById("inputs-area")!

  // Render Simple Inputs
  argMeta.fields.forEach((field, idx) => {
    const inputWrapper = document.createElement("div")
    inputWrapper.style.marginBottom = "10px"

    const label = document.createElement("label")
    label.textContent = field.label || `Argument ${idx}`
    label.style.display = "block"
    label.style.marginBottom = "5px"
    inputWrapper.appendChild(label)

    if (isSimpleField(field)) {
      const input = document.createElement("input")
      input.id = `input-${idx}`
      input.style.width = "100%"
      input.style.padding = "8px"

      if (field.type === "number") {
        input.placeholder = (field as NumberArgumentField).candidType
      } else if (field.type === "boolean") {
        input.type = "checkbox"
        input.style.width = "auto"
      } else {
        input.placeholder = field.type
      }

      inputWrapper.appendChild(input)
    } else {
      const note = document.createElement("div")
      note.textContent = `Complex type (${field.type}) - Input not supported in simple demo`
      note.style.color = "#888"
      inputWrapper.appendChild(note)
    }

    inputsArea.appendChild(inputWrapper)
  })

  // Setup Call Button
  callBtn.onclick = async () => {
    try {
      resultContainer.style.display = "block"
      resultDisplay.textContent = "Calling..."

      const args = argMeta.fields.map((field, idx) => {
        if (!isSimpleField(field)) return undefined // Skip complex for now

        const input = document.getElementById(
          `input-${idx}`
        ) as HTMLInputElement
        if (!input) return undefined

        if (field.type === "boolean") return input.checked
        if (field.type === "number") {
          if (input.value === "") return undefined
          return input.value // DisplayReactor handles string -> bigint conversion!
        }
        return input.value
      })

      console.log("Calling with args:", args)

      const result = await reactor.callMethod({
        functionName: methodName as any,
        args: args as any,
      })

      resultDisplay.textContent = JSON.stringify(result, replacer, 2)
    } catch (e) {
      resultDisplay.textContent = `Error: ${e}`
    }
  }
}

function isSimpleField(field: ArgumentField): boolean {
  return ["text", "number", "principal", "boolean", "null"].includes(field.type)
}

function replacer(_: string, value: any) {
  if (typeof value === "function") return "[Function]"
  if (typeof value === "bigint") return value.toString() + "n"
  if (value instanceof Uint8Array) return "Blob " + value.length + " bytes"
  return value
}
