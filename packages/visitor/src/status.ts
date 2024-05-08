export enum Status {
  Visible = 1 << 0,
  Checked = 1 << 1,
  Hidden = 1 << 2,
  Optional = 1 << 3,
  newOption = 1 << 4,

  Default = Visible,
}

export class StatusHelper {
  public static isHidden(status: number): boolean {
    return (status & Status.Hidden) !== 0
  }

  public static isChecked(status: number): boolean {
    return (status & Status.Checked) !== 0
  }

  public static isVisible(status: number): boolean {
    return (status & Status.Visible) !== 0
  }

  public static isOptional(status: number): boolean {
    return (status & Status.Optional) !== 0
  }

  public static isnewOption(status: number): boolean {
    return (status & Status.newOption) !== 0
  }

  public static toggleChecked(status: number): number {
    return status ^ Status.Checked
  }

  public static toggleVisibility(status: number): number {
    return status ^ Status.Visible
  }
}
