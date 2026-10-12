import { useState, type ReactNode } from "react"
import { formatTokens, groupDigits, type TokenUnits } from "../../lib/format.ts"
import { useFormContext, type EditorProps } from "../context.ts"
import { parseTokenAmount, tokenAmountText } from "../convert.ts"
import { parseBigInt } from "../engine.ts"
import { FieldShell } from "./FieldShell.tsx"
import { filterIntegerText } from "./leaves.tsx"
import { Segmented } from "./Segmented.tsx"

type Mode = "units" | "raw"

interface Shown {
  /** The draft text this display was made for. */
  readonly raw: string
  /** What the input shows. */
  readonly text: string
  /** Why the typed amount was refused. */
  readonly error?: string
}

const shownFor = (raw: string, units: TokenUnits): Shown => ({
  raw,
  text: tokenAmountText(raw, units) ?? raw,
})

/**
 * A token amount: typed as a decimal in the token's units ("1.5 ckBTC"), held
 * in the draft as base units ("150000000"), exactly, through parseUnits. An
 * amount it cannot hold exactly is refused, never rounded; until it is fixed
 * the draft is empty, so no other amount can be sent. A toggle edits the base
 * units directly.
 */
export function UnitsField(
  props: EditorProps & { units: TokenUnits; primitive: string; signed: boolean }
): ReactNode {
  const form = useFormContext()
  const { path, hint, onChange, units, primitive, signed } = props
  const raw = props.draft.k === "leaf" ? props.draft.text : ""
  const [mode, setMode] = useState<Mode>("units")
  const [shown, setShown] = useState<Shown>(() => shownFor(raw, units))
  // The draft changed from outside (reset, prefill, JSON): show it.
  let current = shown
  if (shown.raw !== raw) {
    current = shownFor(raw, units)
    setShown(current)
  }

  const typeUnits = (text: string) => {
    if (text.trim() === "") {
      setShown({ raw: "", text })
      onChange({ k: "leaf", text: "" })
      return
    }
    const parsed = parseTokenAmount(text, units, signed)
    const next = parsed.ok ? parsed.value.toString() : ""
    setShown({ raw: next, text, error: parsed.ok ? undefined : parsed.message })
    onChange({ k: "leaf", text: next })
  }

  const value = parseBigInt(raw)
  const symbol = units.symbol === "" ? undefined : units.symbol
  const meta =
    mode === "units"
      ? typeof value === "bigint"
        ? `= ${groupDigits(value)} base units (${primitive}, ${units.decimals} decimals)`
        : `${units.decimals} decimals; more digits are refused, never rounded`
      : typeof value === "bigint"
        ? `= ${formatTokens(value, units.decimals, symbol)}`
        : `${primitive} in base units`

  return (
    <FieldShell
      path={path}
      label={props.label}
      a11yLabel={props.a11yLabel}
      type={primitive}
      description={hint?.description}
      meta={meta}
      parseMessage={mode === "units" ? current.error : undefined}
      aside={
        <Segmented<Mode>
          label="Amount in"
          value={mode}
          onChange={setMode}
          options={[
            { value: "units", label: symbol ?? "tokens" },
            { value: "raw", label: "base units" },
          ]}
        />
      }
    >
      {(a11y) => (
        <div className="input-group">
          <input
            {...a11y}
            className="input mono"
            inputMode={mode === "units" ? "decimal" : "numeric"}
            autoComplete="off"
            spellCheck={false}
            value={mode === "units" ? current.text : raw}
            placeholder={hint?.placeholder ?? (mode === "units" ? "0.0" : "0")}
            onChange={(e) =>
              mode === "units"
                ? typeUnits(e.target.value)
                : onChange({
                    k: "leaf",
                    text: filterIntegerText(e.target.value),
                  })
            }
            onBlur={() => form.touch(path)}
          />
          <span className="input-addon">
            {mode === "units" ? (symbol ?? "tokens") : "base units"}
          </span>
        </div>
      )}
    </FieldShell>
  )
}
