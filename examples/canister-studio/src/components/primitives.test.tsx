import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { useState } from "react"
import { CacheKeyPanel } from "../calls/CacheKeyPanel.tsx"
import { ModeBadge } from "./Badge.tsx"
import { ProvenanceBadge } from "./ProvenanceBadge.tsx"
import { Tabs } from "./Tabs.tsx"

afterEach(cleanup)

describe("ProvenanceBadge", () => {
  it("says where an interface came from, loudly when uncertified", () => {
    render(
      <>
        <ProvenanceBadge source={{ kind: "typed", module: "icrc1" }} />
        <ProvenanceBadge
          source={{ kind: "metadata", certified: true, moduleHash: null }}
        />
        <ProvenanceBadge
          source={{ kind: "tmp_hack", certified: false, moduleHash: null }}
        />
      </>
    )
    expect(screen.getByText("Typed")).toBeTruthy()
    expect(screen.getByText("Certified metadata")).toBeTruthy()
    const uncertified = screen.getByText("UNCERTIFIED")
    expect(uncertified.className).toContain("badge-err")
    expect(uncertified.getAttribute("title")).toMatch(/nobody certified/)
  })
})

describe("ModeBadge", () => {
  it("names the mode", () => {
    render(<ModeBadge mode="composite_query" />)
    expect(screen.getByText("composite query").className).toContain(
      "badge-composite"
    )
  })
})

describe("CacheKeyPanel", () => {
  it("shows every segment and highlights the caller's", () => {
    const caller = "2vxsx-fae"
    const { container } = render(
      <CacheKeyPanel
        queryKey={[
          "ic-reactor",
          "ic",
          caller,
          "ryjl3-tyaaa-aaaaa-aaaba-cai",
          "icrc1_symbol",
          "4449444c0000",
          "certified",
        ]}
      />
    )
    const highlighted = container.querySelectorAll(".call-key-caller")
    expect(highlighted).toHaveLength(1)
    expect(highlighted[0]?.querySelector(".call-key-value")?.textContent).toBe(
      caller
    )
    expect(container.textContent).toContain("ryjl3-tyaaa-aaaaa-aaaba-cai")
    expect(container.textContent).toContain("The certified twin")
  })
})

function TabsHarness() {
  const [tab, setTab] = useState<"a" | "b" | "c">("a")
  return (
    <Tabs<"a" | "b" | "c">
      label="Test tabs"
      selected={tab}
      onSelect={setTab}
      tabs={[
        { key: "a", label: "Alpha" },
        { key: "b", label: "Beta", disabledReason: "Not now" },
        { key: "c", label: "Gamma" },
      ]}
    >
      <p>Panel {tab}</p>
    </Tabs>
  )
}

describe("Tabs", () => {
  it("is one tab stop; arrows skip disabled tabs and select", () => {
    render(<TabsHarness />)
    const alpha = screen.getByRole("tab", { name: "Alpha" })
    const gamma = screen.getByRole("tab", { name: "Gamma" })
    expect(alpha.getAttribute("tabindex")).toBe("0")
    expect(gamma.getAttribute("tabindex")).toBe("-1")
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(
      alpha.id
    )

    fireEvent.keyDown(alpha, { key: "ArrowRight" })
    expect(gamma.getAttribute("aria-selected")).toBe("true")
    expect(screen.getByText("Panel c")).toBeTruthy()

    fireEvent.keyDown(gamma, { key: "Home" })
    expect(alpha.getAttribute("aria-selected")).toBe("true")
  })
})
