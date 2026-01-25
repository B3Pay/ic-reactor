import { ClientManager } from "@ic-reactor/core"
import { MetadataDisplayReactor } from "@ic-reactor/candid"
import { QueryClient } from "@tanstack/query-core"

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
  `

  // Setup Call Button
  callBtn.onclick = async () => {
    try {
      resultContainer.style.display = "block"
      resultDisplay.textContent = "Calling..."

      const result = await reactor.callMethod({
        functionName: methodName as any,
      })
      console.log(result)

      resultDisplay.textContent = JSON.stringify(result, replacer, 2)
    } catch (e) {
      resultDisplay.textContent = `Error: ${e}`
    }
  }
}

function replacer(_: string, value: any) {
  if (typeof value === "function") return "[Function]"
  if (typeof value === "bigint") return value.toString() + "n"
  if (value instanceof Uint8Array) return "Blob " + value.length + " bytes"
  return value
}
