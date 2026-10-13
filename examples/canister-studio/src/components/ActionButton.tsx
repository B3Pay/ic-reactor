import type { ButtonHTMLAttributes, ReactElement } from "react"

export interface ActionButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "disabled" | "type"
> {
  /** Refuses clicks while true, and says so (aria-disabled). */
  unavailable?: boolean
}

/**
 * A button that turns itself off while the action it started runs, or for a
 * reason shown beside it. It is aria-disabled, never disabled: a disabled
 * button that has the focus drops it to the page, so the keyboard user loses
 * their place and the focus ring the moment they press it.
 */
export function ActionButton({
  unavailable = false,
  onClick,
  ...rest
}: ActionButtonProps): ReactElement {
  return (
    <button
      type="button"
      {...rest}
      aria-disabled={unavailable || undefined}
      onClick={(event) => {
        if (!unavailable) onClick?.(event)
      }}
    />
  )
}
