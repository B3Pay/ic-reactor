export type StatusFlag = keyof (typeof Status)["_flag"]
export type StatusProp = keyof (typeof Status)["_prop"]

export class Status {
  protected static _flag = {
    ///  [0; 31] + [1]
    Visible: 1 << 0,
    ///  [0; 30] + [1, 0]
    Hidden: 1 << 1,
    ///  [0; 29] + [1, 0, 0]
    Disabled: 1 << 2,
  } as const

  protected static _prop = {
    ///  [0; 15] + [1] + [0; 15]
    Optional: 1 << 16,
    ///  [0; 14] + [1] + [0; 16]
    Checked: 1 << 17,
    ///  [0; 13] + [1] + [0; 17]
    FlexRow: 1 << 18,
  } as const

  /// Getter for the _flag object
  public static get Flag() {
    return this._flag
  }

  /// Getter for the _type object
  public static get Prop() {
    return this._prop
  }

  /// Default status is visible
  public static Default = this._flag.Visible

  /// Method to get the number representing visible status with given props
  public static Visible(...props: StatusProp[]): number {
    let result = this._flag.Visible
    for (const prop of props) {
      result |= this._prop[prop]
    }
    return result
  }

  /// Method to get the number representing hidden status with given props
  public static Hidden(...props: StatusProp[]): number {
    let result = this._flag.Hidden
    for (const prop of props) {
      result |= this._prop[prop]
    }
    return result
  }

  /// Method to get the number representing disabled status with given props
  public static Disabled(...props: StatusProp[]): number {
    let result = this._flag.Disabled
    for (const prop of props) {
      result |= this._prop[prop]
    }
    return result
  }

  /// Method to check if a status is visible
  public static isVisible(status: number): boolean {
    return (status & this._flag.Visible) !== 0
  }

  /// Method to check if a status is hidden
  public static isHidden(status: number): boolean {
    return (status & this._flag.Hidden) !== 0
  }

  /// Method to check if a status is disabled
  public static isDisabled(status: number): boolean {
    return (status & this._flag.Disabled) !== 0
  }

  /// Method to check if a status is checked
  public static isChecked(status: number): boolean {
    return (status & this._prop.Checked) !== 0
  }

  /// Method to check if a status is optional
  public static isOptional(status: number): boolean {
    return (status & this._prop.Optional) !== 0
  }

  /// Method to return the flag in a status
  public static flag(status: number): keyof (typeof Status)["_flag"] {
    for (const key in this._flag) {
      if ((status & this._flag[key as StatusFlag]) !== 0) {
        return key as StatusFlag
      }
    }
    throw new Error("Invalid status")
  }

  /// Method to return all present props in a status
  public static props(status: number): StatusProp[] {
    const props: StatusProp[] = []
    for (const prop in this._prop) {
      if ((status & this._prop[prop as StatusProp]) !== 0) {
        props.push(prop as StatusProp)
      }
    }
    return props
  }

  /// Method to return all present flags and props in a status
  public static all(status: number): { flag: StatusFlag; props: StatusProp[] } {
    return { flag: this.flag(status), props: this.props(status) }
  }

  /// Method to hide the status
  public static hide(status: number): number {
    if (!this.isOptional(status)) {
      throw new Error("Cannot modify a non-optional status")
    }
    if (this.isHidden(status)) {
      return status
    }
    return (status | this._flag.Hidden) ^ this._flag.Visible
  }

  /// Method to show the status
  public static show(status: number): number {
    if (!this.isOptional(status)) {
      throw new Error("Cannot modify a non-optional status")
    }
    if (this.isVisible(status)) {
      return status
    }
    return (status | this._flag.Visible) ^ this._flag.Hidden
  }

  /// Method to disable the status
  public static disable(status: number): number {
    if (!this.isOptional(status)) {
      throw new Error("Cannot modify a non-optional status")
    }

    if (this.isDisabled(status)) {
      return status
    }
    return status | this._flag.Disabled
  }

  /// Method to enable the status
  public static enable(status: number): number {
    if (!this.isOptional(status)) {
      throw new Error("Cannot modify a non-optional status")
    }

    if (!this.isDisabled(status)) {
      return status
    }
    return status ^ this._flag.Disabled
  }

  /// Method to add the checked status
  public static check(status: number): number {
    return status | this._prop.Checked
  }

  /// Method to remove the checked status
  public static uncheck(status: number): number {
    return status & ~this._prop.Checked
  }
}
