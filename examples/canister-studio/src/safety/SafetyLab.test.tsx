import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SafetyLab } from "./SafetyLab.tsx"
import { ScenarioCard } from "./ScenarioCard.tsx"
import { SCENARIOS, type ScenarioResult } from "./scenarios.ts"

// The other areas' components are tested where they live; doubles keep this
// test about the lab.
vi.mock("../calls/ErrorPanel.tsx", () => ({
  ErrorPanel: (props: { error: unknown }) => (
    <div data-testid="error-panel">
      {props.error instanceof Error ? props.error.message : String(props.error)}
    </div>
  ),
}))
vi.mock("../values/ReplyView.tsx", () => ({
  ReplyView: () => <div data-testid="reply-view" />,
}))
vi.mock("../forms/MethodForm.tsx", () => ({
  MethodForm: () => <div data-testid="method-form" />,
}))

afterEach(cleanup)

describe("SafetyLab", () => {
  it("server-renders every card, none run, the same way every time", () => {
    const first = renderToString(<SafetyLab />)
    expect(renderToString(<SafetyLab />)).toBe(first)
    for (const scenario of SCENARIOS) expect(first).toContain(scenario.title)
    expect(first.match(/Not run/g)).toHaveLength(SCENARIOS.length)
  })

  it("runs a scenario on click and shows its verdict, checks and request log", async () => {
    render(<SafetyLab />)
    const card = screen
      .getByRole("heading", { name: /Scenario 1:/ })
      .closest("article")
    if (card === null) throw new Error("no card")
    fireEvent.click(within(card).getByRole("button", { name: "Run" }))
    expect(await within(card).findByText("Pass")).toBeTruthy()
    expect(
      within(card).getByText("Verdict: ic-reactor did what this claims")
    ).toBeTruthy()
    // The verdict is announced too, from a live region present from the start.
    expect(within(card).getByText(/^Scenario 1 passed\./)).toBeTruthy()
    expect(within(card).getByText("0 requests")).toBeTruthy()
    expect(within(card).getByTestId("error-panel").textContent).toMatch(
      /needs a signed-in caller/
    )
    expect(screen.getByText("1 passed, 0 failed, 9 not run")).toBeTruthy()
  })
})

describe("ScenarioCard", () => {
  it("says loudly when ic-reactor behaves differently", () => {
    const failed: ScenarioResult = {
      verdict: {
        pass: false,
        summary: "ic-reactor behaved differently: kind.",
      },
      steps: [
        { label: "kind", status: "fail", detail: 'expected "a", got "b"' },
      ],
      requests: [],
    }
    const [scenario] = SCENARIOS
    if (scenario === undefined) throw new Error("no scenario")
    render(
      <ScenarioCard
        number={1}
        scenario={scenario}
        state={{ status: "done", result: failed }}
        blocked={false}
        onRun={() => {}}
      />
    )
    expect(screen.getByText("Fail")).toBeTruthy()
    expect(screen.getByText("Verdict: FAILED")).toBeTruthy()
    expect(screen.getByText("Check FAILED:")).toBeTruthy()
    expect(screen.getByText('expected "a", got "b"')).toBeTruthy()
  })
})
