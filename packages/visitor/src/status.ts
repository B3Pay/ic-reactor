export enum Status {
  Visible = 1 << 0,
  Hidden = 1 << 1,
}

export enum StatusType {
  Checked = 1 << 6,
  Optional = 1 << 7,
}

export class StatusHelper {
  public static isHidden(status: number): boolean {
    return (status & Status.Hidden) !== 0
  }

  public static isChecked(status: number): boolean {
    return (status & StatusType.Checked) !== 0
  }

  public static isVisible(status: number): boolean {
    return (status & Status.Visible) !== 0
  }

  public static isOptional(status: number): boolean {
    return (status & StatusType.Optional) !== 0
  }

  public static toggleChecked(status: number): number {
    return status ^ StatusType.Checked
  }

  public static toggleVisibility(status: number): number {
    return status ^ Status.Visible
  }
}
