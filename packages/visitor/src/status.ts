export type StatusType = keyof (typeof Status)["_type"]

export class Status {
  private static _flag = {
    Visible: 1 << 0,
    Hidden: 1 << 1,
  }

  private static _type = {
    Optional: 1 << 6,
    Checked: 1 << 7,
  }

  public static get Flag() {
    return this._flag
  }

  public static get Type() {
    return this._type
  }

  public static Default = this._flag.Visible

  public static Visible(...types: StatusType[]): number {
    let result = this._flag.Visible
    for (const type of types) {
      result |= this._type[type]
    }
    return result
  }

  public static Hidden(...types: StatusType[]): number {
    let result = this._flag.Hidden
    for (const type of types) {
      result |= this._type[type]
    }
    return result
  }

  public static isHidden(status: number): boolean {
    return (status & this.Hidden()) !== 0
  }

  public static isChecked(status: number): boolean {
    return (status & this._type.Checked) !== 0
  }

  public static isVisible(status: number): boolean {
    return (status & Status.Visible()) !== 0
  }

  public static isOptional(status: number): boolean {
    return (status & this._type.Optional) !== 0
  }

  public static toggleChecked(status: number): number {
    return status ^ this._type.Checked
  }

  public static toggleVisibility(status: number): number {
    return status ^ Status.Visible()
  }
}
